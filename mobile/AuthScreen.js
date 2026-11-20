import React, { useContext, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import theme from "./theme";
import { AuthUiContext } from "./authUiContext";

const AUTH_COLUMN =
  Platform.OS === "web"
    ? { maxWidth: 440, width: "100%", alignSelf: "center" }
    : {};

function AuthPrimaryButton({ label, onPress, loading, disabled }) {
  return (
    <TouchableOpacity
      style={[
        styles.primaryButton,
        (disabled || loading) && styles.buttonDisabled,
        Platform.OS === "web" ? { cursor: "pointer" } : null,
      ]}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={theme.white} />
      ) : (
        <Text style={styles.primaryButtonText} pointerEvents="none">
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export default function AuthScreen() {
  const ctx = useContext(AuthUiContext);
  if (!ctx) return null;
  const {
    authMode,
    setAuthMode,
    email,
    setEmail,
    password,
    setPassword,
    fullName,
    setFullName,
    registerCaps,
    setRegisterCaps,
    authLoading,
    resetStep,
    register,
    login,
    openPasswordReset,
    requestPasswordResetEmail,
    goToPasswordResetConfirm,
    confirmPasswordReset,
    cancelPasswordReset,
  } = ctx;

  const [resetCodeInput, setResetCodeInput] = useState("");
  const isRegister = authMode === "register";
  const isResetRequest = resetStep === "request";
  const isResetConfirm = resetStep === "confirm";
  const isResetFlow = isResetRequest || isResetConfirm;

  const title = isResetFlow
    ? "On vous remet en chemin."
    : isRegister
      ? "Rejoignez l’aventure."
      : "Le chemin commence ici.";
  const bannerText = isResetFlow
    ? "Un nouveau départ. Le code e-mail est valable 30 minutes."
    : "Plus loin, bien entouré. Vos traces, vos relais, votre aventure.";
  const webPointer = Platform.OS === "web" ? { cursor: "pointer" } : null;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <StatusBar style="dark" />
      <ScrollView
        keyboardShouldPersistTaps="always"
        contentContainerStyle={[
          styles.authScrollContent,
          Platform.OS === "web" ? styles.authScrollContentWeb : null,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.authFigmaMain, AUTH_COLUMN]}>
          <Text style={styles.authFigmaBrand}>ravitobox</Text>
          <Text style={styles.authFigmaTitle}>{title}</Text>

          {isResetRequest ? (
            <>
              <Text style={styles.authFigmaHint}>
                Indique ton e-mail : tu recevras un code temporaire. Sans boîte
                mail, utilise ensuite ton code de compte RB-….
              </Text>
              <Text style={styles.authFigmaLabel}>Adresse e-mail</Text>
              <TextInput
                style={styles.authFigmaInput}
                placeholder="vous@exemple.com"
                placeholderTextColor={theme.inkMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                editable={!authLoading}
              />
              <View style={styles.authFigmaCta}>
                <AuthPrimaryButton
                  label="Recevoir le lien →"
                  onPress={requestPasswordResetEmail}
                  loading={authLoading}
                />
              </View>
              <TouchableOpacity
                onPress={goToPasswordResetConfirm}
                style={[styles.authFigmaSwitchWrap, webPointer]}
                activeOpacity={0.7}
                disabled={authLoading}
              >
                <Text style={styles.authFigmaSwitchLink}>
                  J’ai déjà un code →
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={cancelPasswordReset}
                style={[styles.authFigmaSwitchWrap, webPointer]}
                activeOpacity={0.7}
                disabled={authLoading}
              >
                <Text style={styles.authFigmaSwitchLink}>
                  Retour à la connexion
                </Text>
              </TouchableOpacity>
            </>
          ) : isResetConfirm ? (
            <>
              <Text style={styles.authFigmaHint}>
                Code e-mail (XXXX-XXXX) ou code de compte (RB-XXXX-XXXX-XXXX),
                puis ton nouveau mot de passe.
              </Text>
              <Text style={styles.authFigmaLabel}>Adresse e-mail</Text>
              <TextInput
                style={styles.authFigmaInput}
                placeholder="vous@exemple.com"
                placeholderTextColor={theme.inkMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                editable={!authLoading}
              />
              <Text style={styles.authFigmaLabel}>Code reçu</Text>
              <TextInput
                style={styles.authFigmaInput}
                placeholder="XXXX-XXXX ou RB-…"
                placeholderTextColor={theme.inkMuted}
                value={resetCodeInput}
                onChangeText={setResetCodeInput}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!authLoading}
              />
              <Text style={styles.authFigmaLabel}>Nouveau mot de passe</Text>
              <TextInput
                style={styles.authFigmaInput}
                placeholder="••••••••"
                placeholderTextColor={theme.inkMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType="newPassword"
                autoComplete="password-new"
                editable={!authLoading}
              />
              <View style={styles.authFigmaCta}>
                <AuthPrimaryButton
                  label="Valider le nouveau mot de passe →"
                  onPress={() => confirmPasswordReset(resetCodeInput)}
                  loading={authLoading}
                />
              </View>
              <TouchableOpacity
                onPress={cancelPasswordReset}
                style={[styles.authFigmaSwitchWrap, webPointer]}
                activeOpacity={0.7}
                disabled={authLoading}
              >
                <Text style={styles.authFigmaSwitchLink}>
                  Retour à la connexion
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {isRegister ? (
                <>
                  <Text style={styles.authFigmaLabel}>Votre nom</Text>
                  <TextInput
                    style={styles.authFigmaInput}
                    placeholder="Camille Martin"
                    placeholderTextColor={theme.inkMuted}
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                    textContentType="name"
                    autoComplete="name"
                    editable={!authLoading}
                  />
                </>
              ) : null}

              <Text style={styles.authFigmaLabel}>Adresse e-mail</Text>
              <TextInput
                style={styles.authFigmaInput}
                placeholder="vous@exemple.com"
                placeholderTextColor={theme.inkMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                editable={!authLoading}
              />

              <Text style={styles.authFigmaLabel}>Mot de passe</Text>
              <TextInput
                style={styles.authFigmaInput}
                placeholder="••••••••"
                placeholderTextColor={theme.inkMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType={isRegister ? "newPassword" : "password"}
                autoComplete={isRegister ? "password-new" : "password"}
                editable={!authLoading}
              />

              {isRegister ? (
                <>
                  <Text style={styles.authFigmaFieldHint}>
                    8 caractères minimum.
                  </Text>
                  <Text style={styles.authFigmaLabel}>Je suis</Text>
                  <View style={styles.authRoleChipsRow}>
                    {[
                      { key: "user", label: "Coureur" },
                      { key: "host", label: "Hôte" },
                      { key: "ravito", label: "Ravitailleur" },
                    ].map((chip) => {
                      const active = !!registerCaps?.[chip.key];
                      return (
                        <TouchableOpacity
                          key={chip.key}
                          style={[
                            styles.authRoleChip,
                            active && styles.authRoleChipActive,
                            webPointer,
                          ]}
                          activeOpacity={0.8}
                          disabled={authLoading}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          onPress={() => {
                            const next = {
                              ...registerCaps,
                              [chip.key]: !active,
                            };
                            if (!next.user && !next.host && !next.ravito) return;
                            setRegisterCaps(next);
                          }}
                        >
                          <Text
                            style={[
                              styles.authRoleChipText,
                              active && styles.authRoleChipTextActive,
                            ]}
                          >
                            {chip.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : (
                <TouchableOpacity
                  onPress={openPasswordReset}
                  style={[styles.authFigmaForgotWrap, webPointer]}
                  activeOpacity={0.7}
                  disabled={authLoading}
                >
                  <Text style={styles.authFigmaForgotText} pointerEvents="none">
                    Mot de passe oublié ?
                  </Text>
                </TouchableOpacity>
              )}

              <View style={styles.authFigmaCta}>
                <AuthPrimaryButton
                  label={isRegister ? "Créer mon compte →" : "Se connecter →"}
                  onPress={isRegister ? register : login}
                  loading={authLoading}
                />
              </View>

              <TouchableOpacity
                onPress={() => setAuthMode(isRegister ? "login" : "register")}
                style={[styles.authFigmaSwitchWrap, webPointer]}
                activeOpacity={0.7}
                disabled={authLoading}
              >
                <Text style={styles.authFigmaSwitchText}>
                  {isRegister ? "Déjà un compte ? " : "Pas encore de compte ? "}
                  <Text style={styles.authFigmaSwitchLink}>
                    {isRegister ? "Se connecter" : "S'inscrire"}
                  </Text>
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={styles.authFigmaBanner}>
          <View style={styles.authFigmaTopo} pointerEvents="none">
            <View style={[styles.authFigmaRing, styles.authFigmaRing1]} />
            <View style={[styles.authFigmaRing, styles.authFigmaRing2]} />
            <View style={[styles.authFigmaRing, styles.authFigmaRing3]} />
          </View>
          <Text style={styles.authFigmaBannerText}>{bannerText}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  primaryButton: {
    backgroundColor: theme.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  primaryButtonText: {
    color: theme.white,
    fontSize: 16,
    fontWeight: "800",
    fontFamily: theme.font,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  authScrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  authScrollContentWeb: {
    minHeight: "100vh",
    justifyContent: "center",
    paddingVertical: 24,
  },
  authFigmaMain: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
  },
  authFigmaBrand: {
    fontSize: 22,
    fontWeight: "800",
    color: theme.primary,
    letterSpacing: -0.3,
    fontFamily: theme.fontDisplay,
    marginBottom: 28,
  },
  authFigmaTitle: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "800",
    color: theme.ink,
    letterSpacing: -0.6,
    fontFamily: theme.fontDisplay,
    marginBottom: 16,
  },
  authFigmaHint: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.inkMuted,
    fontFamily: theme.font,
    marginBottom: 4,
  },
  authFigmaLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.ink,
    fontFamily: theme.font,
    marginTop: 16,
    marginBottom: 6,
  },
  authFigmaInput: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: theme.ink,
    fontFamily: theme.font,
  },
  authFigmaFieldHint: {
    fontSize: 12,
    color: theme.inkMuted,
    fontFamily: theme.font,
    marginTop: 6,
  },
  authRoleChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  authRoleChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border || "#D5DDD8",
    backgroundColor: "#FFFFFF",
  },
  authRoleChipActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  authRoleChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.ink || "#1F2A24",
    fontFamily: theme.font,
  },
  authRoleChipTextActive: {
    color: "#FFFFFF",
  },
  authFigmaForgotWrap: {
    alignSelf: "flex-end",
    paddingVertical: 8,
    marginTop: 4,
  },
  authFigmaForgotText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.primary,
    fontFamily: theme.font,
  },
  authFigmaCta: {
    marginTop: 20,
  },
  authFigmaSwitchWrap: {
    alignSelf: "center",
    paddingVertical: 14,
    marginTop: 8,
  },
  authFigmaSwitchText: {
    fontSize: 14,
    color: theme.inkMuted,
    fontFamily: theme.font,
    textAlign: "center",
  },
  authFigmaSwitchLink: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.primary,
    fontFamily: theme.font,
  },
  authFigmaBanner: {
    backgroundColor: theme.lime,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 36,
    overflow: "hidden",
    minHeight: 130,
    justifyContent: "center",
  },
  authFigmaTopo: {
    ...StyleSheet.absoluteFillObject,
  },
  authFigmaRing: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "rgba(45, 90, 76, 0.16)",
    borderRadius: 999,
  },
  authFigmaRing1: {
    width: 220,
    height: 220,
    right: -70,
    top: -90,
  },
  authFigmaRing2: {
    width: 150,
    height: 150,
    right: -35,
    top: -55,
  },
  authFigmaRing3: {
    width: 320,
    height: 320,
    left: -150,
    bottom: -210,
  },
  authFigmaBannerText: {
    fontSize: 18,
    lineHeight: 25,
    fontWeight: "700",
    color: theme.limeInk,
    fontFamily: theme.fontDisplay,
    maxWidth: 300,
  },
});
