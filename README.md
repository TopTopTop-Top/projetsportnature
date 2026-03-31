# RavitoBox MVP

Backend + mobile minimal pour une app type "Airbnb du ravito outdoor".

## Installation

```bash
npm install
```

## Lancer en local

```bash
npm run dev
```

ou

```bash
npm start
```

API disponible sur `http://localhost:3000`.

## Lancer en une commande

Depuis la racine:

```bash
npm run dev:all
```

Cette commande lance:

- API backend
- Expo mobile

## Endpoints

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/users` (JWT)
- `POST /api/boxes` (JWT)
- `POST /api/host/boxes` (JWT, role host/both)
- `GET /api/host/boxes` (JWT)
- `GET /api/boxes?city=Annecy`
- `POST /api/trails` (JWT)
- `GET /api/trails?difficulty=hard`
- `POST /api/trails/upload-gpx` (JWT, multipart)
- `POST /api/bookings` (JWT)
- `GET /api/bookings` (JWT)

## Exemples rapides

### 1) Register host

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Lucas Martin","email":"lucas@example.com","password":"secret123","role":"host","city":"Annecy"}'
```

### 2) Login (recupere token)

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"lucas@example.com","password":"secret123"}'
```

### 3) Creer un box

```bash
curl -X POST http://localhost:3000/api/boxes \
  -H "Authorization: Bearer TON_JWT" \
  -H "Content-Type: application/json" \
  -d '{"hostUserId":1,"title":"Box garage centre-ville","latitude":45.8992,"longitude":6.1294,"city":"Annecy","priceCents":700,"hasWater":true}'
```

### 4) Register athlete

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Emma Trail","email":"emma@example.com","password":"secret123","role":"athlete","city":"Lyon"}'
```

### 5) Upload GPX

```bash
curl -X POST http://localhost:3000/api/trails/upload-gpx \
  -H "Authorization: Bearer TON_JWT" \
  -F "gpx=@/chemin/vers/ton-fichier.gpx"
```

### 6) Reserver

```bash
curl -X POST http://localhost:3000/api/bookings \
  -H "Authorization: Bearer TON_JWT" \
  -H "Content-Type: application/json" \
  -d '{"boxId":1,"bookingDate":"2026-04-02","startTime":"08:00","endTime":"09:00"}'
```

## Mobile React Native (Expo)

Dans `mobile/`:

```bash
npm install
npm start
```

Le fichier `mobile/App.js` contient:

- navigation multi-ecrans (Auth + onglets)
- ecran register/login JWT
- refresh token + logout
- liste des boxes
- map des boxes
- reservation d'un box
- upload GPX depuis le telephone
- espace Host pour publier un box

L'app lit l'URL API dans `EXPO_PUBLIC_API_URL`.
Sans variable, elle utilise `https://ravitobox-api.onrender.com/api` par defaut.

## Voir l'app (etapes rapides)

1. Tout en une fois:

```bash
npm run dev:all
```

2. Ou separer (si besoin):

```bash
npm run dev
```

Dans un autre terminal:

```bash
cd mobile
npm start
```

3. Sur smartphone:

- installe l'app `Expo Go` (iOS/Android)
- connecte le tel au meme wifi que ton Mac
- scanne le QR code affiche dans le terminal Expo

4. Sur simulateur:

- dans le terminal Expo, touche `i` pour iOS, `a` pour Android.

## Mettre en ligne (pas local)

1. Deploie l'API sur [Render](https://render.com):

- New Web Service depuis ton repo GitHub
- Build command: `npm install`
- Start command: `npm start`
- Variable d'env: `JWT_SECRET` (obligatoire)

2. Recupere l'URL publique, ex:

- `https://ravitobox-api.onrender.com`

3. Lance mobile avec cette URL:

```bash
EXPO_PUBLIC_API_URL=https://ravitobox-api.onrender.com/api npm --prefix mobile start
```

4. Partage app en ligne:

- via `Expo Go` (QR public expo)
- ou build APK/IPA avec EAS Build pour vraie distribution
