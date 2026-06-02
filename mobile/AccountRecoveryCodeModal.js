import React from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Platform,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const theme = {
  primary: "#0D9488",
  ink: "#0F172A",
  inkMuted: "#64748B",
  border: "#E2E8F0",
  surface: "#FFFFFF",
};

/**
 * Affichage unique du code de compte (inscription ou régénération).
 */
export default function AccountRecoveryCodeModal({
  visible,
  code,
  title = "Code de compte — à conserver",
  subtitle,
  onConfirm,
}) {
  if (!visible || !code) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.iconWrap}>
            <Ionicons name="key-outline" size={28} color={theme.primary} />
          </View>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <View style={styles.codeBox}>
            <Text style={styles.codeText} selectable>
              {code}
            </Text>
          </View>
          <Text style={styles.warning}>
            Ce code ne sera plus affiché. Utilise-le uniquement si tu oublies ton
            mot de passe (avec ton email). Conserve-le comme un mot de passe de
            secours.
          </Text>
          <TouchableOpacity
            style={styles.btn}
            onPress={onConfirm}
            activeOpacity={0.9}
          >
            <Text style={styles.btnText}>J’ai noté mon code</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    padding: 20,
  },
  sheet: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 20,
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
    borderWidth: 1,
    borderColor: theme.border,
  },
  iconWrap: {
    alignSelf: "center",
    marginBottom: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: theme.ink,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.inkMuted,
    textAlign: "center",
    marginBottom: 12,
  },
  codeBox: {
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: theme.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  codeText: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.ink,
    textAlign: "center",
    letterSpacing: 1,
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
  },
  warning: {
    fontSize: 12,
    lineHeight: 17,
    color: theme.inkMuted,
    marginBottom: 16,
  },
  btn: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
