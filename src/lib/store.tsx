/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiError, requestJson } from "./api";
import type {
  AppState,
  ColorMode,
  CommunitySolutionVoteValue,
  ExternalAccount,
  ThemeName,
  User,
  UserPreferences,
  TestRecord,
  LeaderboardEntry,
  CustomLeaderboard,
  CustomLeaderboardEntry,
  QuestionCommunityThread,
} from "./types";

const TOKEN_KEY = "testanalyser-token";
const USER_KEY = "testanalyser-user";
const UI_KEY = "testanalyser-ui";
const ADMIN_OVERRIDE_KEY = "testanalyser-admin-override";
const SHOW_COMPARISON_KEY = "testanalyser-show-comparison";

type AuthResult = { ok: boolean; message?: string };
type CommunityThreadResult = {
  ok: boolean;
  thread?: QuestionCommunityThread;
  message?: string;
};
type CommunityCountsResult = {
  ok: boolean;
  counts?: Record<string, number>;
  message?: string;
};

type Store = {
  state: AppState;
  currentUser: User | null;
  questionCommunityByQuestionId: Record<string, QuestionCommunityThread | undefined>;
  communityCountsByTestId: Record<string, Record<string, number> | undefined>;
  isAdmin: boolean;
  adminOverride: boolean;
  fontScale: number;
  showComparison: boolean;
  setAdminOverride: (enabled: boolean) => void;
  setFontScale: (scale: number) => void;
  setCommunitySolutionsEnabled: (enabled: boolean) => void;
  setMtqShowContent: (enabled: boolean) => void;
  setHighlightKeyChangesInPalette: (enabled: boolean) => void;
  isBootstrapped: boolean;
  register: (payload: {
    name: string;
    email: string;
    password: string;
  }) => Promise<AuthResult>;
  login: (payload: { email: string; password: string }) => Promise<AuthResult>;
  updateProfile: (payload: {
    name: string;
    email: string;
  }) => Promise<AuthResult>;
  updatePassword: (payload: {
    currentPassword: string;
    nextPassword: string;
  }) => Promise<AuthResult>;
  logout: () => void;
  connectExternalAccount: (payload: {
    username: string;
    password: string;
  }) => Promise<AuthResult>;
  resyncAllTests: () => Promise<AuthResult>;
  syncExternalAccount: () => Promise<void>;
  resyncTest: (testId: string) => Promise<void>;
  resyncTestForAllUsers: (testId: string) => Promise<AuthResult>;
  toggleQuestionBookmark: (payload: {
    testId: string;
    questionId: string;
    bookmarked?: boolean;
  }) => Promise<AuthResult>;
  updateQuestionTags: (payload: {
    testId: string;
    questionId: string;
    tags: string[];
  }) => Promise<AuthResult>;
  updateGlobalQuestionTags: (payload: {
    testId: string;
    questionId: string;
    tags: string[];
  }) => Promise<AuthResult>;
  updateAnswerKey: (payload: {
    testId: string;
    questionId: string;
    newKey: unknown;
    qtype?: "MCQ" | "MAQ" | "NAT" | "VMAQ" | "MTQ";
    markingScheme?: {
      correct: number;
      incorrect: number;
      unattempted: number;
    };
  }) => Promise<AuthResult>;
  updateQuestionContent: (payload: {
    testId: string;
    questionId: string;
    sharedPassageContent?: string | null;
    questionContent: string;
    optionContentA?: string | null;
    optionContentB?: string | null;
    optionContentC?: string | null;
    optionContentD?: string | null;
    mtqStatementP?: string | null;
    mtqStatementQ?: string | null;
    mtqStatementR?: string | null;
    mtqStatementS?: string | null;
    solutionContent?: string | null;
  }) => Promise<AuthResult>;
  uploadTemporaryQuestionImage: (payload: {
    testId: string;
    questionId: string;
    dataUrl: string;
  }) => Promise<{ ok: boolean; url?: string; message?: string }>;
  discardTemporaryQuestionImages: (payload: {
    testId: string;
    questionId: string;
    urls: string[];
  }) => Promise<AuthResult>;
  fetchQuestionCommunity: (payload: {
    testId: string;
    questionId: string;
  }) => Promise<CommunityThreadResult>;
  fetchTestCommunityCounts: (testId: string) => Promise<CommunityCountsResult>;
  createQuestionCommunitySolution: (payload: {
    testId: string;
    questionId: string;
    contentMarkdown: string;
  }) => Promise<CommunityThreadResult>;
  updateQuestionCommunitySolution: (payload: {
    testId: string;
    questionId: string;
    solutionId: string;
    contentMarkdown: string;
  }) => Promise<CommunityThreadResult>;
  deleteQuestionCommunitySolution: (payload: {
    testId: string;
    questionId: string;
    solutionId: string;
  }) => Promise<CommunityThreadResult>;
  voteQuestionCommunitySolution: (payload: {
    testId: string;
    questionId: string;
    solutionId: string;
    value: Exclude<CommunitySolutionVoteValue, 0>;
  }) => Promise<CommunityThreadResult>;
  pinQuestionCommunitySolution: (payload: {
    testId: string;
    questionId: string;
    solutionId: string;
    pinned: boolean;
  }) => Promise<CommunityThreadResult>;
  createQuestionCommunityComment: (payload: {
    testId: string;
    questionId: string;
    solutionId: string;
    contentMarkdown: string;
  }) => Promise<CommunityThreadResult>;
  updateQuestionCommunityComment: (payload: {
    testId: string;
    questionId: string;
    solutionId: string;
    commentId: string;
    contentMarkdown: string;
  }) => Promise<CommunityThreadResult>;
  deleteQuestionCommunityComment: (payload: {
    testId: string;
    questionId: string;
    solutionId: string;
    commentId: string;
  }) => Promise<CommunityThreadResult>;
  uploadTemporaryCommunityImage: (payload: {
    testId: string;
    questionId: string;
    dataUrl: string;
  }) => Promise<{ ok: boolean; url?: string; message?: string }>;
  discardTemporaryCommunityImages: (payload: {
    testId: string;
    questionId: string;
    urls: string[];
  }) => Promise<AuthResult>;
  updateMarkingScheme: (payload: {
    testId: string;
    scheme: Record<
      string,
      { correct: number; incorrect: number; unattempted: number }
    >;
    questionTypeMapping?: Record<string, string>;
  }) => Promise<AuthResult>;
  setTheme: (theme: ThemeName) => void;
  setMode: (mode: ColorMode) => void;
  setShowComparison: (show: boolean) => void;
  acknowledgeKeyUpdates: (testId: string) => Promise<void>;
  fetchTestLeaderboard: (testId: string) => Promise<{
    ok: boolean;
    message?: string;
    leaderboard?: LeaderboardEntry[];
  }>;
  createLeaderboard: (payload: {
    title: string;
    examIds: string[];
    description?: string;
  }) => Promise<AuthResult>;
  updateCustomLeaderboard: (id: string, payload: {
    title?: string;
    examIds?: string[];
    description?: string;
  }) => Promise<AuthResult>;
  deleteCustomLeaderboard: (id: string) => Promise<AuthResult>;
  fetchLeaderboards: () => Promise<{
    ok: boolean;
    leaderboards: CustomLeaderboard[];
    message?: string;
  }>;
  fetchCustomLeaderboard: (id: string) => Promise<{
    ok: boolean;
    leaderboard?: CustomLeaderboardEntry[];
    title?: string;
    description?: string;
    examTitles?: string[];
    message?: string;
  }>;
  fetchCustomLeaderboardParticipant: (leaderboardId: string, participantKey: string) => Promise<{
    ok: boolean;
    attempts?: TestRecord[];
    message?: string;
  }>;
};

const StoreContext = createContext<Store | null>(null);

const themeOptions: ThemeName[] = ["ember", "ocean", "forest", "slate"];

const isTheme = (value: unknown): value is ThemeName =>
  typeof value === "string" && themeOptions.includes(value as ThemeName);

const isMode = (value: unknown): value is ColorMode =>
  value === "light" || value === "dark" || value === "system";

const clampFontScale = (value: number) => Math.min(1.3, Math.max(0.9, value));

const normalizeFontScale = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? clampFontScale(value)
    : fallback;

const defaultUi = {
  theme: "ember" as ThemeName,
  mode: "system" as ColorMode,
  fontScale: 1,
};

const loadUi = (): AppState["ui"] => {
  const raw = localStorage.getItem(UI_KEY);
  if (!raw) {
    return defaultUi;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AppState["ui"]>;
    return {
      theme: isTheme(parsed.theme) ? parsed.theme : defaultUi.theme,
      mode: isMode(parsed.mode) ? parsed.mode : defaultUi.mode,
      fontScale: normalizeFontScale(parsed.fontScale, defaultUi.fontScale),
    };
  } catch {
    return defaultUi;
  }
};

const saveUi = (ui: AppState["ui"]) => {
  localStorage.setItem(UI_KEY, JSON.stringify(ui));
};

const loadAdminOverride = () => {
  const raw = localStorage.getItem(ADMIN_OVERRIDE_KEY);
  if (raw === null) {
    return false;
  }
  return raw === "true";
};

const saveAdminOverride = (enabled: boolean) => {
  localStorage.setItem(ADMIN_OVERRIDE_KEY, String(enabled));
};

const loadShowComparison = () => {
  const raw = localStorage.getItem(SHOW_COMPARISON_KEY);
  if (raw === null) {
    return true;
  }
  return raw === "true";
};

const saveShowComparison = (enabled: boolean) => {
  localStorage.setItem(SHOW_COMPARISON_KEY, String(enabled));
};

const loadToken = () => localStorage.getItem(TOKEN_KEY);

const saveToken = (token: string | null) => {
  if (!token) {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
};

const normalizePreferences = (
  value: unknown,
  fallbackUi: AppState["ui"],
): UserPreferences => {
  if (!value || typeof value !== "object") {
    return {
      theme: fallbackUi.theme,
      mode: fallbackUi.mode,
      fontScale: fallbackUi.fontScale,
      acknowledgedKeyUpdates: {},
      communitySolutionsEnabled: true,
      mtqShowContent: true,
      highlightKeyChangesInPalette: true,
    };
  }

  const prefs = value as Partial<UserPreferences>;
  const theme = isTheme(prefs.theme) ? prefs.theme : fallbackUi.theme;
  const mode = isMode(prefs.mode) ? prefs.mode : fallbackUi.mode;
  const fontScale = normalizeFontScale(prefs.fontScale, fallbackUi.fontScale);
  const acknowledgedKeyUpdates =
    prefs.acknowledgedKeyUpdates &&
    typeof prefs.acknowledgedKeyUpdates === "object"
      ? (prefs.acknowledgedKeyUpdates as Record<string, string>)
      : {};
  const communitySolutionsEnabled =
    typeof prefs.communitySolutionsEnabled === "boolean"
      ? prefs.communitySolutionsEnabled
      : true;
  const mtqShowContent =
    typeof prefs.mtqShowContent === "boolean"
      ? prefs.mtqShowContent
      : true;
  const highlightKeyChangesInPalette =
    typeof prefs.highlightKeyChangesInPalette === "boolean"
      ? prefs.highlightKeyChangesInPalette
      : true;

  return {
    theme,
    mode,
    fontScale,
    acknowledgedKeyUpdates,
    communitySolutionsEnabled,
    mtqShowContent,
    highlightKeyChangesInPalette,
  };
};

const normalizeUserRole = (role: unknown): User["role"] =>
  typeof role === "string" && role.toLowerCase() === "admin" ? "admin" : "user";

const normalizeUser = (
  value: {
    id: string;
    name: string;
    email: string;
    role: string;
    preferences?: unknown;
  },
  fallbackUi: AppState["ui"] = defaultUi,
): User => ({
  id: value.id,
  name: value.name,
  email: value.email,
  role: normalizeUserRole(value.role),
  preferences: normalizePreferences(value.preferences, fallbackUi),
});

const saveUser = (user: User | null) => {
  if (!user) {
    localStorage.removeItem(USER_KEY);
    return;
  }
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

const loadUser = (): User | null => {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as User;
    return {
      ...parsed,
      role: normalizeUserRole(parsed.role),
      preferences: normalizePreferences(parsed.preferences, defaultUi),
    };
  } catch {
    return null;
  }
};

const normalizeAccountStatus = (value: unknown): ExternalAccount["status"] => {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (
    normalized === "connected" ||
    normalized === "error" ||
    normalized === "disconnected"
  ) {
    return normalized;
  }
  return "disconnected";
};

const normalizeSyncStatus = (value: unknown): ExternalAccount["syncStatus"] => {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (
    normalized === "syncing" ||
    normalized === "idle" ||
    normalized === "error"
  ) {
    return normalized;
  }
  return "idle";
};

const normalizeAccount = (account: {
  id: string;
  userId: string;
  provider: string;
  username: string;
  remoteDisplayName?: string | null;
  status: string;
  syncStatus?: string;
  syncTotal?: number;
  syncCompleted?: number;
  syncStartedAt?: string | null;
  syncFinishedAt?: string | null;
  lastSyncAt: string | null;
  statusMessage?: string | null;
}): ExternalAccount => ({
  id: account.id,
  userId: account.userId,
  provider: "test.z7i.in",
  username: account.username,
  remoteDisplayName: account.remoteDisplayName ?? null,
  status: normalizeAccountStatus(account.status),
  syncStatus: normalizeSyncStatus(account.syncStatus),
  syncTotal: typeof account.syncTotal === "number" ? account.syncTotal : 0,
  syncCompleted:
    typeof account.syncCompleted === "number" ? account.syncCompleted : 0,
  syncStartedAt: account.syncStartedAt ?? null,
  syncFinishedAt: account.syncFinishedAt ?? null,
  lastSyncAt: account.lastSyncAt ?? null,
  statusMessage: account.statusMessage ?? undefined,
});

const replaceTest = (tests: TestRecord[], updated: TestRecord) =>
  tests.map((test) => (test.id === updated.id ? updated : test));

const updateQuestionInTests = (
  tests: TestRecord[],
  testId: string,
  questionId: string,
  updater: (question: TestRecord["questions"][number]) => TestRecord["questions"][number],
) =>
  tests.map((test) =>
    test.id !== testId
      ? test
      : {
          ...test,
          questions: test.questions.map((question) =>
            question.id === questionId ? updater(question) : question,
          ),
        },
  );

const upsertCommunityThread = (
  current: Record<string, QuestionCommunityThread | undefined>,
  thread: QuestionCommunityThread,
) => ({
  ...current,
  [thread.questionId]: thread,
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const AppStoreProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AppState>(() => ({
    externalAccounts: [],
    tests: [],
    ui: loadUi(),
  }));
  const [currentUser, setCurrentUser] = useState<User | null>(() => loadUser());
  const [questionCommunityByQuestionId, setQuestionCommunityByQuestionId] =
    useState<Record<string, QuestionCommunityThread | undefined>>({});
  const [communityCountsByTestId, setCommunityCountsByTestId] = useState<
    Record<string, Record<string, number> | undefined>
  >({});
  const [adminOverride, setAdminOverrideState] = useState(loadAdminOverride);
  const [showComparison, setShowComparisonState] = useState(loadShowComparison);
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  
  const stateRef = useRef(state);
  const currentUserRef = useRef(currentUser);

  useEffect(() => {
    stateRef.current = state;
    saveUi(state.ui);
  }, [state]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    const theme = currentUser?.preferences.theme ?? state.ui.theme;
    const mode = currentUser?.preferences.mode ?? state.ui.mode;
    const fontScale = currentUser?.preferences.fontScale ?? state.ui.fontScale;
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.setProperty("--reader-font-scale", String(fontScale));

    const media =
      typeof window !== "undefined" && "matchMedia" in window
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
    const applyMode = () => {
      const resolved =
        mode === "system" ? (media?.matches ? "dark" : "light") : mode;
      root.classList.toggle("dark", resolved === "dark");
    };

    applyMode();
    if (mode === "system" && media) {
      media.addEventListener("change", applyMode);
      return () => media.removeEventListener("change", applyMode);
    }
  }, [currentUser, state.ui.fontScale, state.ui.mode, state.ui.theme]);

  const clearSession = useCallback(() => {
    saveToken(null);
    saveUser(null);
    setCurrentUser(null);
    setQuestionCommunityByQuestionId({});
    setCommunityCountsByTestId({});
    setState((prev) => ({
      ...prev,
      externalAccounts: [],
      tests: [],
    }));
  }, []);

  const refreshAccounts = useCallback(async (token: string) => {
    const data = await requestJson<{ accounts: ExternalAccount[] }>(
      "/api/external",
      {
        token,
      },
    );
    const normalized = data.accounts.map(normalizeAccount);
    setState((prev) => ({
      ...prev,
      externalAccounts: normalized,
    }));
    return normalized;
  }, []);

  const refreshTests = useCallback(async (token: string) => {
    const data = await requestJson<{ tests: TestRecord[] }>("/api/tests", {
      token,
    });
    setState((prev) => ({
      ...prev,
      tests: data.tests,
    }));
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      const token = loadToken();
      if (!token) {
        setIsBootstrapped(true);
        return;
      }

      try {
        const me = await requestJson<{
          user: {
            id: string;
            name: string;
            email: string;
            role: string;
            preferences?: unknown;
          };
        }>("/api/auth/me", { token });
        const normalized = normalizeUser(me.user, stateRef.current.ui);
        setCurrentUser(normalized);
        saveUser(normalized);
        setState((prev) => ({
          ...prev,
          ui: {
            theme: normalized.preferences.theme,
            mode: normalized.preferences.mode,
            fontScale: normalized.preferences.fontScale,
          },
        }));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSession();
          setIsBootstrapped(true);
          return;
        }
        console.error(error);
      }

      try {
        const [accounts] = await Promise.all([
          refreshAccounts(token),
          refreshTests(token),
        ]);
        triggerMissingRemoteDisplayNameRefresh(token, accounts);
      } catch (error) {
        console.error(error);
      } finally {
        setIsBootstrapped(true);
      }
    };

    void bootstrap();
  }, [clearSession, refreshAccounts, refreshTests]);

  const register: Store["register"] = useCallback(async ({ name, email, password }) => {
    try {
      const data = await requestJson<{
        user: {
          id: string;
          name: string;
          email: string;
          role: string;
          preferences?: unknown;
        };
        token: string;
      }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      const normalized = normalizeUser(data.user, stateRef.current.ui);
      saveToken(data.token);
      saveUser(normalized);
      setCurrentUser(normalized);
      setState((prev) => ({
        ...prev,
        ui: {
          theme: normalized.preferences.theme,
          mode: normalized.preferences.mode,
          fontScale: normalized.preferences.fontScale,
        },
      }));
      const [accounts] = await Promise.all([
        refreshAccounts(data.token),
        refreshTests(data.token),
      ]);
      triggerMissingRemoteDisplayNameRefresh(data.token, accounts);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Unable to register.",
      };
    }
  }, [refreshAccounts, refreshTests]);

  const login: Store["login"] = useCallback(async ({ email, password }) => {
    try {
      const data = await requestJson<{
        user: {
          id: string;
          name: string;
          email: string;
          role: string;
          preferences?: unknown;
        };
        token: string;
      }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const normalized = normalizeUser(data.user, stateRef.current.ui);
      saveToken(data.token);
      saveUser(normalized);
      setCurrentUser(normalized);
      setState((prev) => ({
        ...prev,
        ui: {
          theme: normalized.preferences.theme,
          mode: normalized.preferences.mode,
          fontScale: normalized.preferences.fontScale,
        },
      }));
      const [accounts] = await Promise.all([
        refreshAccounts(data.token),
        refreshTests(data.token),
      ]);
      triggerMissingRemoteDisplayNameRefresh(data.token, accounts);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Unable to sign in.",
      };
    }
  }, [refreshAccounts, refreshTests]);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const updateProfile: Store["updateProfile"] = useCallback(async ({ name, email }) => {
    if (!currentUserRef.current) {
      return { ok: false, message: "Not signed in." };
    }
    const token = loadToken();
    if (!token) {
      return { ok: false, message: "Missing session token." };
    }

    try {
      const data = await requestJson<{
        user: {
          id: string;
          name: string;
          email: string;
          role: string;
          preferences?: unknown;
        };
      }>("/api/auth/profile", {
        method: "PATCH",
        token,
        body: JSON.stringify({ name, email }),
      });
      const normalized = normalizeUser(data.user, stateRef.current.ui);
      setCurrentUser(normalized);
      saveUser(normalized);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : "Unable to update profile.",
      };
    }
  }, []);

  const updatePassword: Store["updatePassword"] = useCallback(async ({
    currentPassword,
    nextPassword,
  }) => {
    if (!currentUserRef.current) {
      return { ok: false, message: "Not signed in." };
    }
    const token = loadToken();
    if (!token) {
      return { ok: false, message: "Missing session token." };
    }

    try {
      await requestJson<{ ok: true }>("/api/auth/password", {
        method: "PATCH",
        token,
        body: JSON.stringify({ currentPassword, nextPassword }),
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : "Unable to update password.",
      };
    }
  }, []);

  const upsertAccount = useCallback((next: ExternalAccount) => {
    setState((prev) => ({
      ...prev,
      externalAccounts: prev.externalAccounts.some(
        (item) => item.id === next.id,
      )
        ? prev.externalAccounts.map((item) =>
            item.id === next.id ? next : item,
          )
        : [...prev.externalAccounts, next],
    }));
  }, []);

  const refreshMissingRemoteDisplayName = useCallback(async (token: string) => {
    try {
      const data = await requestJson<{ account: ExternalAccount }>(
        "/api/external/refresh-missing-name",
        {
          method: "POST",
          token,
        },
      );
      upsertAccount(normalizeAccount(data.account));
    } catch (error) {
      console.error(error);
    }
  }, [upsertAccount]);

  const triggerMissingRemoteDisplayNameRefresh = useEffectEvent((
    token: string,
    accounts: ExternalAccount[],
  ) => {
    const account = accounts.find((item) => item.provider === "test.z7i.in");
    if (!account || account.remoteDisplayName) {
      return;
    }
    void refreshMissingRemoteDisplayName(token);
  });

  const connectExternalAccount: Store["connectExternalAccount"] = useCallback(async (
    payload,
  ) => {
    if (!currentUserRef.current) {
      return { ok: false, message: "Not signed in." };
    }
    const token = loadToken();
    if (!token) {
      return { ok: false, message: "Missing session token." };
    }

    try {
      const data = await requestJson<{ account: ExternalAccount }>(
        "/api/external/connect",
        {
          method: "POST",
          token,
          body: JSON.stringify({
            username: payload.username,
            password: payload.password,
            provider: "test.z7i.in",
          }),
        },
      );
      upsertAccount(normalizeAccount(data.account));
      return { ok: true };
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unable to connect account.";
      return { ok: false, message };
    }
  }, [upsertAccount]);

  const resyncAllTests: Store["resyncAllTests"] = useCallback(async () => {
    const currentUser = currentUserRef.current;
    if (!currentUser) {
      return { ok: false, message: "Not signed in." };
    }
    const token = loadToken();
    if (!token) {
      return { ok: false, message: "Missing session token." };
    }

    const account = stateRef.current.externalAccounts.find(
      (item) =>
        item.userId === currentUser.id && item.provider === "test.z7i.in",
    );
    if (!account) {
      return { ok: false, message: "External account not connected." };
    }
    if (account.syncStatus === "syncing") {
      return { ok: false, message: "Sync already in progress." };
    }

    const forceAttemptExamIds = Array.from(
      new Set(
        stateRef.current.tests
          .map((test) => test.externalExamId)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    if (forceAttemptExamIds.length === 0) {
      return { ok: false, message: "No external tests available to resync." };
    }

    try {
      const data = await requestJson<{
        account: ExternalAccount;
      }>("/api/external/sync", {
        method: "POST",
        token,
        body: JSON.stringify({
          provider: "test.z7i.in",
          forceAttemptExamIds,
          attemptsOnly: true,
        }),
      });
      upsertAccount(normalizeAccount(data.account));
      await refreshTests(token);
      return { ok: true };
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unable to resync tests.";
      return { ok: false, message };
    }
  }, [upsertAccount, refreshTests]);

  const syncExternalAccount: Store["syncExternalAccount"] = useCallback(async () => {
    const currentUser = currentUserRef.current;
    if (!currentUser) {
      return;
    }
    const token = loadToken();
    if (!token) {
      return;
    }

    const account = stateRef.current.externalAccounts.find(
      (item) =>
        item.userId === currentUser.id && item.provider === "test.z7i.in",
    );
    if (!account || account.syncStatus === "syncing") {
      return;
    }

    const optimistic: ExternalAccount = {
      ...account,
      syncStatus: "syncing",
      syncTotal: 0,
      syncCompleted: 0,
      syncStartedAt: new Date().toISOString(),
      syncFinishedAt: null,
    };
    upsertAccount(optimistic);

    let keepPolling = true;
    const pollSync = async () => {
      while (keepPolling) {
        await wait(1500);
        try {
          const accounts = await refreshAccounts(token);
          const refreshed = accounts.find((item) => item.id === account.id);
          if (!refreshed || refreshed.syncStatus !== "syncing") {
            break;
          }
        } catch (error) {
          console.error(error);
          break;
        }
      }
    };

    const pollTask = pollSync();
    let syncSucceeded = false;
    let stopPollingEarly = true;
    try {
      const data = await requestJson<{
        account: ExternalAccount;
      }>("/api/external/sync", {
        method: "POST",
        token,
        body: JSON.stringify({ provider: "test.z7i.in" }),
      });
      syncSucceeded = true;
      upsertAccount(normalizeAccount(data.account));
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        stopPollingEarly = false;
      } else {
        console.error(error);
      }
    } finally {
      if (stopPollingEarly) {
        keepPolling = false;
      }
      await pollTask;
      await refreshAccounts(token);
      if (syncSucceeded) {
        await refreshTests(token);
      }
    }
  }, [upsertAccount, refreshAccounts, refreshTests]);

  const updateAnswerKey: Store["updateAnswerKey"] = useCallback(async ({
    testId,
    questionId,
    newKey,
    qtype,
    markingScheme,
  }) => {
    const token = loadToken();
    if (!token) {
      return { ok: false, message: "Missing session token." };
    }

    try {
      const data = await requestJson<{ test: TestRecord }>(
        `/api/tests/${testId}/answer-key`,
        {
          method: "POST",
          token,
          body: JSON.stringify({ questionId, newKey, qtype, markingScheme }),
        },
      );
      setState((prev) => ({
        ...prev,
        tests: replaceTest(prev.tests, data.test),
      }));
      return { ok: true };
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unable to update answer key.";
      return { ok: false, message };
    }
  }, []);

  const resyncTest: Store["resyncTest"] = useCallback(async (testId) => {
    const token = loadToken();
    if (!token) {
      return;
    }

    try {
      const data = await requestJson<{ test: TestRecord }>(
        `/api/tests/${testId}/resync`,
        {
          method: "POST",
          token,
        },
      );
      setState((prev) => {
        const hasId = prev.tests.some((item) => item.id === data.test.id);
        if (hasId) {
          return { ...prev, tests: replaceTest(prev.tests, data.test) };
        }
        const filtered = prev.tests.filter(
          (item) => item.externalExamId !== data.test.externalExamId,
        );
        return { ...prev, tests: [...filtered, data.test] };
      });
    } catch (error) {
      console.error(error);
    }
  }, []);

  const resyncTestForAllUsers: Store["resyncTestForAllUsers"] = useCallback(async (
    testId,
  ) => {
    const token = loadToken();
    if (!token) {
      return { ok: false, message: "Missing session token." };
    }

    try {
      const data = await requestJson<{ test: TestRecord; message?: string }>(
        `/api/tests/${testId}/resync-all`,
        {
          method: "POST",
          token,
        },
      );
      setState((prev) => ({
        ...prev,
        tests: replaceTest(prev.tests, data.test),
      }));
      return { ok: true, message: data.message };
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unable to force resync this exam.";
      return { ok: false, message };
    }
  }, []);

  const toggleQuestionBookmark: Store["toggleQuestionBookmark"] = useCallback(async ({
    testId,
    questionId,
    bookmarked,
  }) => {
    const token = loadToken();
    if (!token) {
      return { ok: false, message: "Missing session token." };
    }

    try {
      const data = await requestJson<{ test: TestRecord }>(
        `/api/tests/${testId}/questions/${questionId}/bookmarks`,
        {
          method: "PATCH",
          token,
          body: JSON.stringify({ bookmarked }),
        },
      );
      setState((prev) => ({
        ...prev,
        tests: replaceTest(prev.tests, data.test),
      }));
      return { ok: true };
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unable to update bookmark.";
      return { ok: false, message };
    }
  }, []);

  const updateQuestionTags: Store["updateQuestionTags"] = useCallback(async ({
    testId,
    questionId,
    tags,
  }) => {
    const token = loadToken();
    if (!token) {
      return { ok: false, message: "Missing session token." };
    }

    let previousTestsSnapshot: TestRecord[] = [];
    setState((prev) => {
      previousTestsSnapshot = prev.tests;
      return {
        ...prev,
        tests: updateQuestionInTests(prev.tests, testId, questionId, (question) => ({
          ...question,
          tags: [...tags],
        })),
      };
    });

    try {
      const data = await requestJson<{ test: TestRecord }>(
        `/api/tests/${testId}/questions/${questionId}/tags`,
        {
          method: "PATCH",
          token,
          body: JSON.stringify({ tags }),
        },
      );
      setState((prev) => ({
        ...prev,
        tests: replaceTest(prev.tests, data.test),
      }));
      return { ok: true };
    } catch (error) {
      setState((prev) => ({
        ...prev,
        tests: previousTestsSnapshot,
      }));
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unable to update tags.";
      return { ok: false, message };
    }
  }, []);

  const updateGlobalQuestionTags: Store["updateGlobalQuestionTags"] = useCallback(async ({
    testId,
    questionId,
    tags,
  }) => {
    const token = loadToken();
    if (!token) {
      return { ok: false, message: "Missing session token." };
    }

    let previousTestsSnapshot: TestRecord[] = [];
    setState((prev) => {
      previousTestsSnapshot = prev.tests;
      return {
        ...prev,
        tests: updateQuestionInTests(prev.tests, testId, questionId, (question) => ({
          ...question,
          lockedTags: [...tags],
        })),
      };
    });

    try {
      const data = await requestJson<{ test: TestRecord }>(
        `/api/tests/${testId}/questions/${questionId}/global-tags`,
        {
          method: "PATCH",
          token,
          body: JSON.stringify({ tags }),
        },
      );
      setState((prev) => ({
        ...prev,
        tests: replaceTest(prev.tests, data.test),
      }));
      return { ok: true };
    } catch (error) {
      setState((prev) => ({
        ...prev,
        tests: previousTestsSnapshot,
      }));
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unable to update global tags.";
      return { ok: false, message };
    }
  }, []);

  const updateQuestionContent: Store["updateQuestionContent"] = useCallback(async ({
    testId,
    questionId,
    sharedPassageContent,
    questionContent,
    optionContentA,
    optionContentB,
    optionContentC,
    optionContentD,
    mtqStatementP,
    mtqStatementQ,
    mtqStatementR,
    mtqStatementS,
    solutionContent,
  }) => {
    const token = loadToken();
    if (!token) {
      return { ok: false, message: "Missing session token." };
    }

    try {
      const data = await requestJson<{ test: TestRecord }>(
        `/api/tests/${testId}/questions/${questionId}/content`,
        {
          method: "POST",
          token,
          body: JSON.stringify({
            sharedPassageContent,
            questionContent,
            optionContentA,
            optionContentB,
            optionContentC,
            optionContentD,
            mtqStatementP,
            mtqStatementQ,
            mtqStatementR,
            mtqStatementS,
            solutionContent,
          }),
        },
      );
      setState((prev) => ({
        ...prev,
        tests: replaceTest(prev.tests, data.test),
      }));
      return { ok: true };
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unable to update question content.";
      return { ok: false, message };
    }
  }, []);

  const uploadTemporaryQuestionImage: Store["uploadTemporaryQuestionImage"] =
    useCallback(async ({ testId, questionId, dataUrl }) => {
      const token = loadToken();
      if (!token) {
        return { ok: false, message: "Missing session token." };
      }

      try {
        const data = await requestJson<{ url: string }>(
          `/api/tests/${testId}/questions/${questionId}/content-images/temp`,
          {
            method: "POST",
            token,
            body: JSON.stringify({ dataUrl }),
          },
        );
        return { ok: true, url: data.url };
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unable to upload image.";
        return { ok: false, message };
      }
    }, []);

  const discardTemporaryQuestionImages: Store["discardTemporaryQuestionImages"] =
    useCallback(async ({ testId, questionId, urls }) => {
      const token = loadToken();
      if (!token) {
        return { ok: false, message: "Missing session token." };
      }

      try {
        await requestJson<{ ok: true }>(
          `/api/tests/${testId}/questions/${questionId}/content-images/temp/cleanup`,
          {
            method: "POST",
            token,
            body: JSON.stringify({ urls }),
          },
        );
        return { ok: true };
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unable to discard temporary images.";
        return { ok: false, message };
      }
    }, []);

  const applyCommunityThread = useCallback((testId: string, thread: QuestionCommunityThread) => {
    setQuestionCommunityByQuestionId((prev) => upsertCommunityThread(prev, thread));
    setCommunityCountsByTestId((prev) => ({
      ...prev,
      [testId]: {
        ...(prev[testId] ?? {}),
        [thread.questionId]: thread.solutionCount,
      },
    }));
  }, []);

  const fetchQuestionCommunity: Store["fetchQuestionCommunity"] = useCallback(async ({
    testId,
    questionId,
  }) => {
    const token = loadToken();
    if (!token) {
      return { ok: false, message: "Missing session token." };
    }

    try {
      const thread = await requestJson<QuestionCommunityThread>(
        `/api/tests/${testId}/questions/${questionId}/community`,
        { token },
      );
      applyCommunityThread(testId, thread);
      return { ok: true, thread };
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unable to fetch community solutions.";
      return { ok: false, message };
    }
  }, [applyCommunityThread]);

  const fetchTestCommunityCounts: Store["fetchTestCommunityCounts"] = useCallback(async (
    testId,
  ) => {
    const token = loadToken();
    if (!token) {
      return { ok: false, message: "Missing session token." };
    }

    try {
      const data = await requestJson<{ counts: Record<string, number> }>(
        `/api/tests/${testId}/community-counts`,
        { token },
      );
      setCommunityCountsByTestId((prev) => ({
        ...prev,
        [testId]: data.counts,
      }));
      return { ok: true, counts: data.counts };
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unable to fetch community counts.";
      return { ok: false, message };
    }
  }, []);

  const createQuestionCommunitySolution: Store["createQuestionCommunitySolution"] =
    useCallback(async ({ testId, questionId, contentMarkdown }) => {
      const token = loadToken();
      if (!token) {
        return { ok: false, message: "Missing session token." };
      }

      try {
        const thread = await requestJson<QuestionCommunityThread>(
          `/api/tests/${testId}/questions/${questionId}/community-solutions`,
          {
            method: "POST",
            token,
            body: JSON.stringify({ contentMarkdown }),
          },
        );
        applyCommunityThread(testId, thread);
        return { ok: true, thread };
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unable to create community solution.";
        return { ok: false, message };
      }
    }, [applyCommunityThread]);

  const updateQuestionCommunitySolution: Store["updateQuestionCommunitySolution"] =
    useCallback(async ({ testId, questionId, solutionId, contentMarkdown }) => {
      const token = loadToken();
      if (!token) {
        return { ok: false, message: "Missing session token." };
      }

      try {
        const thread = await requestJson<QuestionCommunityThread>(
          `/api/tests/${testId}/questions/${questionId}/community-solutions/${solutionId}`,
          {
            method: "PATCH",
            token,
            body: JSON.stringify({ contentMarkdown }),
          },
        );
        applyCommunityThread(testId, thread);
        return { ok: true, thread };
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unable to update community solution.";
        return { ok: false, message };
      }
    }, [applyCommunityThread]);

  const deleteQuestionCommunitySolution: Store["deleteQuestionCommunitySolution"] =
    useCallback(async ({ testId, questionId, solutionId }) => {
      const token = loadToken();
      if (!token) {
        return { ok: false, message: "Missing session token." };
      }

      try {
        const thread = await requestJson<QuestionCommunityThread>(
          `/api/tests/${testId}/questions/${questionId}/community-solutions/${solutionId}`,
          {
            method: "DELETE" as RequestInit["method"],
            token,
          },
        );
        applyCommunityThread(testId, thread);
        return { ok: true, thread };
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unable to delete community solution.";
        return { ok: false, message };
      }
    }, [applyCommunityThread]);

  const voteQuestionCommunitySolution: Store["voteQuestionCommunitySolution"] =
    useCallback(async ({ testId, questionId, solutionId, value }) => {
      const token = loadToken();
      if (!token) {
        return { ok: false, message: "Missing session token." };
      }

      try {
        const thread = await requestJson<QuestionCommunityThread>(
          `/api/tests/${testId}/questions/${questionId}/community-solutions/${solutionId}/vote`,
          {
            method: "POST",
            token,
            body: JSON.stringify({ value }),
          },
        );
        applyCommunityThread(testId, thread);
        return { ok: true, thread };
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unable to vote on community solution.";
        return { ok: false, message };
      }
    }, [applyCommunityThread]);

  const pinQuestionCommunitySolution: Store["pinQuestionCommunitySolution"] =
    useCallback(async ({ testId, questionId, solutionId, pinned }) => {
      const token = loadToken();
      if (!token) {
        return { ok: false, message: "Missing session token." };
      }

      try {
        const thread = await requestJson<QuestionCommunityThread>(
          `/api/tests/${testId}/questions/${questionId}/community-solutions/${solutionId}/pin`,
          {
            method: "PATCH",
            token,
            body: JSON.stringify({ pinned }),
          },
        );
        applyCommunityThread(testId, thread);
        return { ok: true, thread };
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unable to update pin state.";
        return { ok: false, message };
      }
    }, [applyCommunityThread]);

  const createQuestionCommunityComment: Store["createQuestionCommunityComment"] =
    useCallback(async ({ testId, questionId, solutionId, contentMarkdown }) => {
      const token = loadToken();
      if (!token) {
        return { ok: false, message: "Missing session token." };
      }

      try {
        const thread = await requestJson<QuestionCommunityThread>(
          `/api/tests/${testId}/questions/${questionId}/community-solutions/${solutionId}/comments`,
          {
            method: "POST",
            token,
            body: JSON.stringify({ contentMarkdown }),
          },
        );
        applyCommunityThread(testId, thread);
        return { ok: true, thread };
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unable to create comment.";
        return { ok: false, message };
      }
    }, [applyCommunityThread]);

  const updateQuestionCommunityComment: Store["updateQuestionCommunityComment"] =
    useCallback(async ({ testId, questionId, solutionId, commentId, contentMarkdown }) => {
      const token = loadToken();
      if (!token) {
        return { ok: false, message: "Missing session token." };
      }

      try {
        const thread = await requestJson<QuestionCommunityThread>(
          `/api/tests/${testId}/questions/${questionId}/community-solutions/${solutionId}/comments/${commentId}`,
          {
            method: "PATCH",
            token,
            body: JSON.stringify({ contentMarkdown }),
          },
        );
        applyCommunityThread(testId, thread);
        return { ok: true, thread };
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unable to update comment.";
        return { ok: false, message };
      }
    }, [applyCommunityThread]);

  const deleteQuestionCommunityComment: Store["deleteQuestionCommunityComment"] =
    useCallback(async ({ testId, questionId, solutionId, commentId }) => {
      const token = loadToken();
      if (!token) {
        return { ok: false, message: "Missing session token." };
      }

      try {
        const thread = await requestJson<QuestionCommunityThread>(
          `/api/tests/${testId}/questions/${questionId}/community-solutions/${solutionId}/comments/${commentId}`,
          {
            method: "DELETE" as RequestInit["method"],
            token,
          },
        );
        applyCommunityThread(testId, thread);
        return { ok: true, thread };
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unable to delete comment.";
        return { ok: false, message };
      }
    }, [applyCommunityThread]);

  const uploadTemporaryCommunityImage: Store["uploadTemporaryCommunityImage"] =
    useCallback(async ({ testId, questionId, dataUrl }) => {
      const token = loadToken();
      if (!token) {
        return { ok: false, message: "Missing session token." };
      }

      try {
        const data = await requestJson<{ url: string }>(
          `/api/tests/${testId}/questions/${questionId}/community-assets/temp`,
          {
            method: "POST",
            token,
            body: JSON.stringify({ dataUrl }),
          },
        );
        return { ok: true, url: data.url };
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unable to upload image.";
        return { ok: false, message };
      }
    }, []);

  const discardTemporaryCommunityImages: Store["discardTemporaryCommunityImages"] =
    useCallback(async ({ testId, questionId, urls }) => {
      const token = loadToken();
      if (!token) {
        return { ok: false, message: "Missing session token." };
      }

      try {
        await requestJson<{ ok: true }>(
          `/api/tests/${testId}/questions/${questionId}/community-assets/temp/cleanup`,
          {
            method: "POST",
            token,
            body: JSON.stringify({ urls }),
          },
        );
        return { ok: true };
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unable to discard temporary images.";
        return { ok: false, message };
      }
    }, []);

  const updateMarkingScheme: Store["updateMarkingScheme"] = useCallback(async ({
    testId,
    scheme,
    questionTypeMapping,
  }) => {
    const token = loadToken();
    if (!token) {
      return { ok: false, message: "Missing session token." };
    }

    try {
      const data = await requestJson<{ test: TestRecord; message?: string }>(
        `/api/tests/${testId}/marking-scheme`,
        {
          method: "POST",
          token,
          body: JSON.stringify({ scheme, questionTypeMapping }),
        },
      );
      setState((prev) => ({
        ...prev,
        tests: replaceTest(prev.tests, data.test),
      }));
      return { ok: true, message: data.message };
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unable to update marking scheme.";
      return { ok: false, message };
    }
  }, []);

  const savePreferences = useCallback(async (preferences: UserPreferences) => {
    const currentUser = currentUserRef.current;
    if (!currentUser) {
      return;
    }
    const token = loadToken();
    if (!token) {
      return;
    }

    const optimistic = { ...currentUser, preferences };
    setCurrentUser(optimistic);
    saveUser(optimistic);
    setState((prev) => ({
      ...prev,
      ui: {
        theme: preferences.theme,
        mode: preferences.mode,
        fontScale: preferences.fontScale,
      },
    }));

    try {
      const data = await requestJson<{
        user: {
          id: string;
          name: string;
          email: string;
          role: string;
          preferences?: unknown;
        };
      }>("/api/auth/preferences", {
        method: "PATCH",
        token,
        body: JSON.stringify({ preferences }),
      });
      const normalized = normalizeUser(data.user, stateRef.current.ui);
      setCurrentUser(normalized);
      saveUser(normalized);
    } catch (error) {
      console.error(error);
    }
  }, []);

  const setTheme: Store["setTheme"] = useCallback((theme) => {
    const currentUser = currentUserRef.current;
    if (currentUser) {
      void savePreferences({ ...currentUser.preferences, theme });
      return;
    }
    setState((prev) => ({
      ...prev,
      ui: { ...prev.ui, theme },
    }));
  }, [savePreferences]);

  const setMode: Store["setMode"] = useCallback((mode) => {
    const currentUser = currentUserRef.current;
    if (currentUser) {
      void savePreferences({ ...currentUser.preferences, mode });
      return;
    }
    setState((prev) => ({
      ...prev,
      ui: { ...prev.ui, mode },
    }));
  }, [savePreferences]);

  const setCommunitySolutionsEnabled: Store["setCommunitySolutionsEnabled"] = useCallback((
    enabled,
  ) => {
    const currentUser = currentUserRef.current;
    if (!currentUser) {
      return;
    }
    if (!enabled) {
      setQuestionCommunityByQuestionId({});
      setCommunityCountsByTestId({});
    }
    void savePreferences({
      ...currentUser.preferences,
      communitySolutionsEnabled: enabled,
    });
  }, [savePreferences]);

  const setMtqShowContent: Store["setMtqShowContent"] = useCallback((enabled) => {
    const currentUser = currentUserRef.current;
    if (!currentUser) {
      return;
    }
    void savePreferences({
      ...currentUser.preferences,
      mtqShowContent: enabled,
    });
  }, [savePreferences]);

  const setHighlightKeyChangesInPalette: Store["setHighlightKeyChangesInPalette"] =
    useCallback((enabled) => {
      const currentUser = currentUserRef.current;
      if (!currentUser) {
        return;
      }
      void savePreferences({
        ...currentUser.preferences,
        highlightKeyChangesInPalette: enabled,
      });
    }, [savePreferences]);

  const setShowComparison: Store["setShowComparison"] = useCallback((show) => {
    setShowComparisonState(show);
    saveShowComparison(show);
  }, []);

  const setFontScale: Store["setFontScale"] = useCallback((scale) => {
    const currentUser = currentUserRef.current;
    const nextScale = clampFontScale(scale);
    if (currentUser) {
      void savePreferences({
        ...currentUser.preferences,
        fontScale: nextScale,
      });
      return;
    }
    setState((prev) => ({
      ...prev,
      ui: { ...prev.ui, fontScale: nextScale },
    }));
  }, [savePreferences]);

  const setAdminOverride: Store["setAdminOverride"] = useCallback((enabled) => {
    setAdminOverrideState(enabled);
    saveAdminOverride(enabled);
  }, []);

  const acknowledgeKeyUpdates: Store["acknowledgeKeyUpdates"] = useCallback(async (
    testId,
  ) => {
    const currentUser = currentUserRef.current;
    if (!currentUser) {
      return;
    }
    const test = stateRef.current.tests.find((item) => item.id === testId);
    if (!test) {
      return;
    }
    const latestKeyUpdate = test.questions.reduce<string | null>(
      (latest, question) => {
        if (!question.lastKeyUpdateTime) {
          return latest;
        }
        if (!latest || question.lastKeyUpdateTime > latest) {
          return question.lastKeyUpdateTime;
        }
        return latest;
      },
      null,
    );
    if (!latestKeyUpdate) {
      return;
    }

    const updated = {
      ...currentUser.preferences,
      acknowledgedKeyUpdates: {
        ...currentUser.preferences.acknowledgedKeyUpdates,
        [testId]: latestKeyUpdate,
      },
    };
    await savePreferences(updated);
  }, [savePreferences]);

  const fetchTestLeaderboard: Store["fetchTestLeaderboard"] = useCallback(async (testId) => {
    const token = loadToken();
    if (!token) {
      return { ok: false, message: "Missing session token." };
    }

    try {
      const data = await requestJson<{ leaderboard: LeaderboardEntry[] }>(
        `/api/tests/${testId}/leaderboard`,
        {
          token,
        },
      );
      return { ok: true, leaderboard: data.leaderboard };
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unable to fetch leaderboard.";
      return { ok: false, message };
    }
  }, []);

  const createLeaderboard: Store["createLeaderboard"] = useCallback(async (payload) => {
    const token = loadToken();
    if (!token) {
      return { ok: false, message: "Missing session token." };
    }
    try {
      await requestJson("/api/leaderboards", {
        method: "POST",
        token,
        body: JSON.stringify(payload),
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : "Unable to create leaderboard.",
      };
    }
  }, []);

  const updateCustomLeaderboard: Store["updateCustomLeaderboard"] = useCallback(async (id, payload) => {
    const token = loadToken();
    if (!token) {
      return { ok: false, message: "Missing session token." };
    }
    try {
      await requestJson(`/api/leaderboards/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify(payload),
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : "Unable to update leaderboard.",
      };
    }
  }, []);

  const deleteCustomLeaderboard: Store["deleteCustomLeaderboard"] = useCallback(async (id) => {
    const token = loadToken();
    if (!token) {
      return { ok: false, message: "Missing session token." };
    }
    try {
      await requestJson(`/api/leaderboards/${id}`, {
        method: "DELETE",
        token,
      });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : "Unable to delete leaderboard.",
      };
    }
  }, []);

  const fetchLeaderboards: Store["fetchLeaderboards"] = useCallback(async () => {
    const token = loadToken();
    if (!token) {
      return { ok: false, message: "Missing session token.", leaderboards: [] };
    }
    try {
      const data = await requestJson<{ leaderboards: any[] }>("/api/leaderboards", {
        token,
      });
      return { ok: true, leaderboards: data.leaderboards };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : "Unable to fetch leaderboards.",
        leaderboards: [],
      };
    }
  }, []);

  const fetchCustomLeaderboard: Store["fetchCustomLeaderboard"] = useCallback(async (id) => {
    const token = loadToken();
    if (!token) {
      return { ok: false, message: "Missing session token." };
    }
    try {
      const data = await requestJson<{
        leaderboard: CustomLeaderboardEntry[];
        title: string;
        description?: string | null;
        examTitles?: string[];
      }>(
        `/api/leaderboards/${id}`,
        { token },
      );
      return {
        ok: true,
        leaderboard: data.leaderboard,
        title: data.title,
        description: data.description ?? undefined,
        examTitles: data.examTitles ?? [],
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to fetch custom leaderboard.",
      };
    }
  }, []);

  const fetchCustomLeaderboardParticipant: Store["fetchCustomLeaderboardParticipant"] = useCallback(async (leaderboardId, participantKey) => {
    const token = loadToken();
    if (!token) {
      return { ok: false, message: "Missing session token." };
    }
    try {
      const data = await requestJson<{ attempts: TestRecord[] }>(
        `/api/leaderboards/${leaderboardId}/participant/${encodeURIComponent(participantKey)}`,
        { token },
      );
      return {
        ok: true,
        attempts: data.attempts,
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to fetch participant data.",
      };
    }
  }, []);

  const adminEmails = [
    "spssabaris@gmail.com",
    "sbaniruddh1@gmail.com",
    "testing@gmail.com",
  ];
  const isAdmin = useMemo(() =>
    currentUser?.role === "admin" ||
    (currentUser?.email ? adminEmails.includes(currentUser.email) : false), [currentUser]);

  const fontScale = useMemo(() => currentUser?.preferences.fontScale ?? state.ui.fontScale, [currentUser, state.ui.fontScale]);

  const value = useMemo(() => ({
    state,
    currentUser,
    questionCommunityByQuestionId,
    communityCountsByTestId,
    isAdmin,
    adminOverride,
    fontScale,
    showComparison,
    setAdminOverride,
    setFontScale,
    setCommunitySolutionsEnabled,
    setMtqShowContent,
    setHighlightKeyChangesInPalette,
    isBootstrapped,
    register,
    login,
    updateProfile,
    updatePassword,
    logout,
    connectExternalAccount,
    syncExternalAccount,
    resyncAllTests,
    resyncTest,
    resyncTestForAllUsers,
    toggleQuestionBookmark,
    updateQuestionTags,
    updateGlobalQuestionTags,
    updateAnswerKey,
    updateQuestionContent,
    uploadTemporaryQuestionImage,
    discardTemporaryQuestionImages,
    fetchQuestionCommunity,
    fetchTestCommunityCounts,
    createQuestionCommunitySolution,
    updateQuestionCommunitySolution,
    deleteQuestionCommunitySolution,
    voteQuestionCommunitySolution,
    pinQuestionCommunitySolution,
    createQuestionCommunityComment,
    updateQuestionCommunityComment,
    deleteQuestionCommunityComment,
    uploadTemporaryCommunityImage,
    discardTemporaryCommunityImages,
    updateMarkingScheme,
    setTheme,
    setMode,
    setShowComparison,
    acknowledgeKeyUpdates,
    fetchTestLeaderboard,
    createLeaderboard,
    updateCustomLeaderboard,
    deleteCustomLeaderboard,
    fetchLeaderboards,
    fetchCustomLeaderboard,
    fetchCustomLeaderboardParticipant,
  }), [
    state,
    currentUser,
    questionCommunityByQuestionId,
    communityCountsByTestId,
    isAdmin,
    adminOverride,
    fontScale,
    showComparison,
    setAdminOverride,
    setFontScale,
    setCommunitySolutionsEnabled,
    setMtqShowContent,
    setHighlightKeyChangesInPalette,
    isBootstrapped,
    register,
    login,
    updateProfile,
    updatePassword,
    logout,
    connectExternalAccount,
    syncExternalAccount,
    resyncAllTests,
    resyncTest,
    resyncTestForAllUsers,
    toggleQuestionBookmark,
    updateQuestionTags,
    updateGlobalQuestionTags,
    updateAnswerKey,
    updateQuestionContent,
    uploadTemporaryQuestionImage,
    discardTemporaryQuestionImages,
    fetchQuestionCommunity,
    fetchTestCommunityCounts,
    createQuestionCommunitySolution,
    updateQuestionCommunitySolution,
    deleteQuestionCommunitySolution,
    voteQuestionCommunitySolution,
    pinQuestionCommunitySolution,
    createQuestionCommunityComment,
    updateQuestionCommunityComment,
    deleteQuestionCommunityComment,
    uploadTemporaryCommunityImage,
    discardTemporaryCommunityImages,
    updateMarkingScheme,
    setTheme,
    setMode,
    setShowComparison,
    acknowledgeKeyUpdates,
    fetchTestLeaderboard,
    createLeaderboard,
    updateCustomLeaderboard,
    deleteCustomLeaderboard,
    fetchLeaderboards,
    fetchCustomLeaderboard,
    fetchCustomLeaderboardParticipant,
  ]);

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
};

export const useAppStore = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error("useAppStore must be used within AppStoreProvider");
  }
  return ctx;
};
