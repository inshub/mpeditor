import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import i18n from "../i18n";

interface WechatAccount {
  id: string;
  name: string;
  appId: string;
  appSecret: string;
}

interface WechatSettingsDraft {
  proxyEnabled: boolean;
  socksProxy: string;
  httpProxy: string;
  httpsProxy: string;
  wechatProxyUrl: string;
  wechatAccounts: WechatAccount[];
  defaultWechatAccountId: string;
}

export function useWechatAccountManager<T extends WechatSettingsDraft>({
  settingsDraft,
  setSettingsDraft,
  setCenteredNotice,
  buildWechatProxyDomain,
}: {
  settingsDraft: T;
  setSettingsDraft: Dispatch<SetStateAction<T>>;
  setCenteredNotice: Dispatch<SetStateAction<string | null>>;
  buildWechatProxyDomain: (value: string) => string;
}) {
  const [editingWechatAccountId, setEditingWechatAccountId] = useState<string | null>(null);
  const [testingWechatAccountId, setTestingWechatAccountId] = useState<string | null>(null);
  const [wechatAccountNameInput, setWechatAccountNameInput] = useState("");
  const [wechatAccountAppIdInput, setWechatAccountAppIdInput] = useState("");
  const [wechatAccountSecretInput, setWechatAccountSecretInput] = useState("");
  const translate = useCallback(
    (key: string, options?: Record<string, unknown>) => i18n.t(key, options) as string,
    []
  );

  const resetWechatAccountForm = useCallback(() => {
    setEditingWechatAccountId(null);
    setWechatAccountNameInput("");
    setWechatAccountAppIdInput("");
    setWechatAccountSecretInput("");
  }, []);

  const startEditWechatAccount = (account: WechatAccount) => {
    setEditingWechatAccountId(account.id);
    setWechatAccountNameInput(account.name);
    setWechatAccountAppIdInput(account.appId);
    setWechatAccountSecretInput(account.appSecret);
  };

  const saveWechatAccountFromForm = () => {
    const name =
      wechatAccountNameInput.trim() || translate("workspace.feedback.defaultWechatAccountName");
    const appId = wechatAccountAppIdInput.trim();
    const appSecret = wechatAccountSecretInput.trim();

    if (!appId || !appSecret) {
      toast.error(translate("workspace.feedback.wechatCredentialsRequired"));
      return;
    }

    setSettingsDraft((prev) => {
      if (editingWechatAccountId) {
        const updatedAccounts = prev.wechatAccounts.map((account) =>
          account.id === editingWechatAccountId ? { ...account, name, appId, appSecret } : account
        );
        return { ...prev, wechatAccounts: updatedAccounts };
      }

      const newAccount: WechatAccount = {
        id: `wx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name,
        appId,
        appSecret,
      };
      const updatedAccounts = [...prev.wechatAccounts, newAccount];
      const nextDefaultId = prev.defaultWechatAccountId || newAccount.id;
      return { ...prev, wechatAccounts: updatedAccounts, defaultWechatAccountId: nextDefaultId };
    });

    resetWechatAccountForm();
  };

  const removeWechatAccount = (id: string) => {
    setSettingsDraft((prev) => {
      const updatedAccounts = prev.wechatAccounts.filter((account) => account.id !== id);
      const nextDefaultId =
        prev.defaultWechatAccountId === id
          ? (updatedAccounts[0]?.id ?? "")
          : prev.defaultWechatAccountId;
      return { ...prev, wechatAccounts: updatedAccounts, defaultWechatAccountId: nextDefaultId };
    });
    if (editingWechatAccountId === id) {
      resetWechatAccountForm();
    }
  };

  const testWechatAccount = async (account: WechatAccount) => {
    setTestingWechatAccountId(account.id);
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let settled = false;
    const draftNetworkProxy = {
      enabled: settingsDraft.proxyEnabled,
      socksProxy: settingsDraft.socksProxy.trim(),
      httpProxy: settingsDraft.httpProxy.trim(),
      httpsProxy: settingsDraft.httpsProxy.trim(),
    };
    const draftWechatProxyDomain = buildWechatProxyDomain(settingsDraft.wechatProxyUrl);
    try {
      timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        setTestingWechatAccountId(null);
        toast.error(
          translate("workspace.feedback.wechatConnectTimeout", { accountName: account.name })
        );
      }, 15000);

      await invoke<string>("test_wechat_account", {
        appId: account.appId,
        appSecret: account.appSecret,
        proxyDomain: draftWechatProxyDomain || undefined,
        networkProxy: draftNetworkProxy,
      });
      if (settled) return;
      settled = true;
      const successMessage = translate("workspace.feedback.wechatConnectSuccess", {
        accountName: account.name,
      });
      setCenteredNotice(successMessage);
      setTimeout(
        () =>
          setCenteredNotice((current) =>
            current === successMessage ? null : current
          ),
        1800
      );
    } catch (err) {
      if (settled) return;
      settled = true;
      toast.error(
        translate("workspace.feedback.wechatConnectFailed", {
          accountName: account.name,
          message: err instanceof Error ? err.message : translate("workspace.feedback.unknownError"),
        })
      );
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (!settled) settled = true;
      setTestingWechatAccountId(null);
    }
  };

  return {
    editingWechatAccountId,
    testingWechatAccountId,
    wechatAccountNameInput,
    wechatAccountAppIdInput,
    wechatAccountSecretInput,
    setWechatAccountNameInput,
    setWechatAccountAppIdInput,
    setWechatAccountSecretInput,
    resetWechatAccountForm,
    startEditWechatAccount,
    saveWechatAccountFromForm,
    removeWechatAccount,
    testWechatAccount,
  };
}
