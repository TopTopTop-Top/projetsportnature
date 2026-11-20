/**
 * Stockage d'objets (GPX) : S3 / Cloudflare R2 si configuré, sinon dossier local uploads/.
 *
 * Variables d'environnement :
 *  - S3 : AWS_S3_BUCKET + AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY
 *         (optionnel : AWS_REGION, S3_ENDPOINT, S3_PUBLIC_URL, S3_KEY_PREFIX)
 *  - R2 : R2_BUCKET + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY + (R2_ACCOUNT_ID ou R2_ENDPOINT)
 *         (recommandé : R2_PUBLIC_URL, domaine public du bucket)
 *
 * `@aws-sdk/client-s3` est chargé via require optionnel : s'il manque, on reste en local.
 */
const fs = require("fs");
const path = require("path");

const uploadsDir = path.join(__dirname, "../../uploads");

let cachedConfig;
let cachedClient;
let cachedSdk;

function loadSdk() {
  if (cachedSdk !== undefined) return cachedSdk;
  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    cachedSdk = require("@aws-sdk/client-s3");
  } catch (_e) {
    cachedSdk = null;
  }
  return cachedSdk;
}

/** Retourne la config distante ou null (=> stockage local). */
function getRemoteConfig() {
  if (cachedConfig !== undefined) return cachedConfig;
  const env = process.env;
  cachedConfig = null;
  if (env.AWS_S3_BUCKET && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    const region = env.AWS_REGION || "eu-west-3";
    const endpoint = env.S3_ENDPOINT || undefined;
    const publicBase = (
      env.S3_PUBLIC_URL ||
      (endpoint
        ? `${endpoint.replace(/\/$/, "")}/${env.AWS_S3_BUCKET}`
        : `https://${env.AWS_S3_BUCKET}.s3.${region}.amazonaws.com`)
    ).replace(/\/$/, "");
    cachedConfig = {
      provider: "s3",
      bucket: env.AWS_S3_BUCKET,
      region,
      endpoint,
      forcePathStyle: !!endpoint,
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      publicBase,
      prefix: env.S3_KEY_PREFIX || "gpx/",
    };
  } else if (
    env.R2_BUCKET &&
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY &&
    (env.R2_ACCOUNT_ID || env.R2_ENDPOINT)
  ) {
    const endpoint =
      env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    cachedConfig = {
      provider: "r2",
      bucket: env.R2_BUCKET,
      region: "auto",
      endpoint,
      forcePathStyle: true,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      publicBase: (
        env.R2_PUBLIC_URL || `${endpoint.replace(/\/$/, "")}/${env.R2_BUCKET}`
      ).replace(/\/$/, ""),
      prefix: env.R2_KEY_PREFIX || "gpx/",
    };
  }
  return cachedConfig;
}

function getClient() {
  const cfg = getRemoteConfig();
  const sdk = loadSdk();
  if (!cfg || !sdk) return null;
  if (cachedClient) return cachedClient;
  cachedClient = new sdk.S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: cfg.forcePathStyle,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  return cachedClient;
}

/** true si les uploads partent vers S3/R2 (config complète + SDK installé). */
function isRemoteStorageEnabled() {
  return !!(getRemoteConfig() && loadSdk());
}

function safeBaseName(name) {
  return path.basename(String(name || "file.gpx")).replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Enregistre un fichier GPX.
 * @param {{ buffer?: Buffer, path?: string, filename?: string, originalname?: string, mimetype?: string }} file
 *   Fichier multer (disque : `path` + `filename`) ou buffer en mémoire.
 * @returns {Promise<{url:string, storage:'s3'|'r2'|'local', key:string}>}
 */
async function saveGpx(file) {
  if (!file) throw new Error("saveGpx: missing file");
  const baseName = safeBaseName(
    file.filename ||
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(
        file.originalname || ".gpx"
      )}`
  );
  const client = getClient();
  const cfg = getRemoteConfig();

  if (client && cfg) {
    const sdk = loadSdk();
    const body = file.buffer || fs.readFileSync(file.path);
    const key = `${cfg.prefix}${baseName}`;
    await client.send(
      new sdk.PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: body,
        ContentType: file.mimetype && file.mimetype.includes("xml") ? file.mimetype : "application/gpx+xml",
      })
    );
    // Le fichier temporaire local n'est plus nécessaire.
    if (file.path) {
      try {
        fs.unlinkSync(file.path);
      } catch (_e) {
        // ignore
      }
    }
    return { url: `${cfg.publicBase}/${key}`, storage: cfg.provider, key };
  }

  // Local : multer a déjà écrit sur disque ; sinon on écrit le buffer.
  if (!file.path && file.buffer) {
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, baseName), file.buffer);
  }
  return { url: `/uploads/${baseName}`, storage: "local", key: baseName };
}

/** Supprime un objet distant à partir de son URL publique (best effort, ne jette jamais). */
async function deleteRemoteByUrl(url) {
  try {
    const client = getClient();
    const cfg = getRemoteConfig();
    if (!client || !cfg || typeof url !== "string") return false;
    const prefix = `${cfg.publicBase}/`;
    if (!url.startsWith(prefix)) return false;
    const key = decodeURIComponent(url.slice(prefix.length));
    if (!key || key.includes("..")) return false;
    const sdk = loadSdk();
    await client.send(new sdk.DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
    return true;
  } catch (e) {
    console.error("objectStorage delete failed:", e.message);
    return false;
  }
}

module.exports = {
  isRemoteStorageEnabled,
  saveGpx,
  deleteRemoteByUrl,
  uploadsDir,
};
