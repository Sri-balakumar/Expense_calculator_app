// Toast + Confirm + Prompt — port of ui.js (showToast/showConfirm/showPrompt)
// exposed through a context so any screen can call useToast()/useConfirm()/usePrompt().

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { currencySymbol } from "../util/money";

type ToastType = "info" | "success" | "error";

interface ConfirmOpts {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}
interface PromptOpts {
  title?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  keyboardType?: "default" | "numeric";
}

interface FeedbackValue {
  toast: (message: string, type?: ToastType) => void;
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  prompt: (opts: PromptOpts) => Promise<string | null>;
}

const FeedbackContext = createContext<FeedbackValue>({
  toast: () => {},
  confirm: async () => false,
  prompt: async () => null,
});

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const [toastMsg, setToastMsg] = useState<{ text: string; type: ToastType } | null>(
    null
  );
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<any>(null);

  const toast = useCallback(
    (message: string, type: ToastType = "info") => {
      setToastMsg({ text: message, type });
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }).start(() => setToastMsg(null));
      }, type === "error" ? 3500 : 2500);
    },
    [opacity]
  );

  // --- confirm ---
  const [confirmState, setConfirmState] = useState<
    (ConfirmOpts & { resolve: (v: boolean) => void }) | null
  >(null);
  const confirm = useCallback(
    (opts: ConfirmOpts) =>
      new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve })),
    []
  );

  // --- prompt ---
  const [promptState, setPromptState] = useState<
    (PromptOpts & { resolve: (v: string | null) => void }) | null
  >(null);
  const [promptValue, setPromptValue] = useState("");
  const prompt = useCallback(
    (opts: PromptOpts) =>
      new Promise<string | null>((resolve) => {
        setPromptValue(opts.defaultValue || "");
        setPromptState({ ...opts, resolve });
      }),
    []
  );

  const toastBg =
    toastMsg?.type === "error"
      ? colors.danger
      : toastMsg?.type === "success"
      ? colors.success
      : colors.primary;

  return (
    <FeedbackContext.Provider value={{ toast, confirm, prompt }}>
      {children}

      {/* Toast */}
      {toastMsg && (
        <Animated.View
          pointerEvents="none"
          style={[styles.toastWrap, { opacity }]}
        >
          <View style={[styles.toast, { backgroundColor: toastBg }]}>
            <Text style={styles.toastIcon}>
              {toastMsg.type === "error" ? "!" : toastMsg.type === "success" ? "✓" : "i"}
            </Text>
            <Text style={styles.toastText}>{toastMsg.text}</Text>
          </View>
        </Animated.View>
      )}

      {/* Confirm */}
      <Modal visible={!!confirmState} transparent animationType="fade">
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            confirmState?.resolve(false);
            setConfirmState(null);
          }}
        >
          <Pressable style={[styles.card, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.title, { color: colors.text }]}>
              {confirmState?.title || "Are you sure?"}
            </Text>
            {!!confirmState?.message && (
              <Text style={[styles.message, { color: colors.textMuted }]}>
                {confirmState.message}
              </Text>
            )}
            <View style={styles.actions}>
              <Pressable
                style={[styles.btn, { backgroundColor: colors.chipBg }]}
                onPress={() => {
                  confirmState?.resolve(false);
                  setConfirmState(null);
                }}
              >
                <Text style={[styles.btnText, { color: colors.text }]}>
                  {confirmState?.cancelText || "Cancel"}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.btn,
                  {
                    backgroundColor:
                      confirmState?.danger === false ? colors.primary : colors.danger,
                  },
                ]}
                onPress={() => {
                  confirmState?.resolve(true);
                  setConfirmState(null);
                }}
              >
                <Text style={[styles.btnText, { color: "#fff" }]}>
                  {confirmState?.confirmText || "Delete"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Prompt */}
      <Modal visible={!!promptState} transparent animationType="fade">
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            promptState?.resolve(null);
            setPromptState(null);
          }}
        >
          <Pressable style={[styles.card, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.title, { color: colors.text }]}>
              {promptState?.title || "Enter value"}
            </Text>
            <View style={{ justifyContent: "center" }}>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.inputBg,
                    paddingLeft: promptState?.keyboardType === "numeric" ? 32 : 14,
                  },
                ]}
                placeholder={promptState?.placeholder}
                placeholderTextColor={colors.textMuted}
                value={promptValue}
                onChangeText={setPromptValue}
                keyboardType={promptState?.keyboardType || "default"}
                autoFocus
              />
              {promptState?.keyboardType === "numeric" && (
                <Text
                  style={{
                    position: "absolute",
                    left: 14,
                    color: colors.textMuted,
                    fontSize: 16,
                    fontWeight: "700",
                  }}
                >
                  {currencySymbol()}
                </Text>
              )}
            </View>
            <View style={styles.actions}>
              <Pressable
                style={[styles.btn, { backgroundColor: colors.chipBg }]}
                onPress={() => {
                  promptState?.resolve(null);
                  setPromptState(null);
                }}
              >
                <Text style={[styles.btnText, { color: colors.text }]}>
                  {promptState?.cancelText || "Cancel"}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.btn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  const val = promptValue.trim();
                  promptState?.resolve(val || null);
                  setPromptState(null);
                }}
              >
                <Text style={[styles.btnText, { color: "#fff" }]}>
                  {promptState?.confirmText || "OK"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </FeedbackContext.Provider>
  );
}

export const useFeedback = () => useContext(FeedbackContext);

const styles = StyleSheet.create({
  toastWrap: {
    position: "absolute",
    bottom: 90,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 1000,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    maxWidth: "90%",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  toastIcon: {
    color: "#fff",
    fontWeight: "800",
    marginRight: 10,
    fontSize: 16,
  },
  toastText: { color: "#fff", fontSize: 14, flexShrink: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 18,
    padding: 22,
  },
  title: { fontSize: 18, fontWeight: "800", textAlign: "center", marginBottom: 6 },
  message: { fontSize: 14, textAlign: "center", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginTop: 10,
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 18 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnText: { fontWeight: "700", fontSize: 15 },
});
