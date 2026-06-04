import { create } from "zustand";
import { pb } from "@/lib/pocketbase";
import * as auth from "@/lib/repos/auth";

interface AuthState {
  isAuthenticated: boolean;
  email: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  // Keep the store in sync with PocketBase's persisted authStore.
  pb.authStore.onChange(() => {
    set({
      isAuthenticated: pb.authStore.isValid,
      email: (pb.authStore.record?.email as string) ?? null,
    });
  });

  return {
    isAuthenticated: pb.authStore.isValid,
    email: (pb.authStore.record?.email as string) ?? null,
    login: async (email, password) => {
      await auth.login(email, password);
    },
    logout: () => auth.logout(),
  };
});
