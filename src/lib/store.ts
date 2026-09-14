import { AppState, DO, User, WarehouseItem } from "./types";

const STORAGE_KEY = "enventry_inventory";

const DEFAULT_ITEMS: WarehouseItem[] = [
  { id: "1", name: "Gram (चना)", count: 0 },
  { id: "2", name: "Maize (मक्का)", count: 0 },
  { id: "3", name: "Nuts (मेवा)", count: 0 },
  { id: "4", name: "Paddy (धान)", count: 0 },
  { id: "5", name: "Rice (चावल)", count: 0 },
  { id: "6", name: "Salt (नमक)", count: 0 },
  { id: "7", name: "Sugar (चीनी)", count: 0 },
  { id: "8", name: "Wheat (गेहूं)", count: 0 },
];

function getDefaultState(): AppState {
  return {
    users: [
      {
        id: "user_1",
        name: "Swati Keshari",
        email: "keshariswati511@gmail.com",
        password: "password",
      },
    ],
    DOs: [],
    items: DEFAULT_ITEMS,
    currentUserId: null,
  };
}

function loadState(): AppState {
  if (typeof window === "undefined") return getDefaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultState();
    const parsed = JSON.parse(raw) as AppState;
    const defaults = getDefaultState();
    // Sync default user password in case it was updated
    const syncedUsers = parsed.users.map((u) => {
      const def = defaults.users.find((d) => d.id === u.id);
      if (def && u.password !== def.password) {
        return { ...u, password: def.password };
      }
      return u;
    });
    return {
      ...parsed,
      users: syncedUsers.length ? syncedUsers : defaults.users,
      items: parsed.items?.length ? parsed.items : DEFAULT_ITEMS,
    };
  } catch {
    return getDefaultState();
  }
}

function saveState(state: AppState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Auth
export function getUsers(): User[] {
  return loadState().users;
}

export function loginUser(
  email: string,
  password: string
): User | null {
  const state = loadState();
  const user = state.users.find(
    (u) => u.email === email && u.password === password
  );
  if (user) {
    state.currentUserId = user.id;
    saveState(state);
  }
  return user ?? null;
}

export function signupUser(
  name: string,
  email: string,
  password: string
): User {
  const state = loadState();
  if (state.users.some((u) => u.email === email)) {
    throw new Error("Email already registered");
  }
  const user: User = {
    id: genId(),
    name,
    email,
    password,
  };
  state.users.push(user);
  state.currentUserId = user.id;
  saveState(state);
  return user;
}

export function logoutUser(): void {
  const state = loadState();
  state.currentUserId = null;
  saveState(state);
}

export function getCurrentUser(): User | null {
  const state = loadState();
  if (!state.currentUserId) return null;
  return state.users.find((u) => u.id === state.currentUserId) ?? null;
}

// DOs
export function getDOs(userId?: string): DO[] {
  const state = loadState();
  const uid = userId ?? state.currentUserId;
  return state.DOs
    .filter((c) => (uid ? c.userId === uid : true))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getDOsInRange(
  from: string,
  to: string,
  userId?: string
): DO[] {
  const state = loadState();
  const uid = userId ?? state.currentUserId;
  return state.DOs
    .filter((c) => {
      const matchUser = uid ? c.userId === uid : true;
      const matchDate = c.date >= from && c.date <= to;
      return matchUser && matchDate;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function createDO(
  data: Omit<DO, "id" | "createdAt" | "userId">
): DO {
  const state = loadState();
  const DO: DO = {
    ...data,
    id: genId(),
    createdAt: Date.now(),
    userId: state.currentUserId ?? "unknown",
  };
  state.DOs.push(DO);
  saveState(state);
  return DO;
}

export function deleteDO(id: string): void {
  const state = loadState();
  state.DOs = state.DOs.filter((c) => c.id !== id);
  saveState(state);
}

// Items
export function getItems(): WarehouseItem[] {
  return loadState().items;
}

export function addItem(name: string): WarehouseItem {
  const state = loadState();
  const item: WarehouseItem = {
    id: genId(),
    name,
    count: 0,
  };
  state.items.push(item);
  saveState(state);
  return item;
}

export function deleteItem(id: string): void {
  const state = loadState();
  state.items = state.items.filter((i) => i.id !== id);
  saveState(state);
}

export function updateItemCount(id: string, count: number): void {
  const state = loadState();
  const item = state.items.find((i) => i.id === id);
  if (item) {
    item.count = count;
    saveState(state);
  }
}
