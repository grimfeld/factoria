import { pb } from "../pocketbase";

/** Log in with email + password. Signup is closed (ADR-0002). */
export async function login(email: string, password: string): Promise<void> {
  await pb.collection("users").authWithPassword(email, password);
}

export function logout(): void {
  pb.authStore.clear();
}

export function isAuthenticated(): boolean {
  return pb.authStore.isValid;
}

export function currentUserEmail(): string | null {
  return (pb.authStore.record?.email as string) ?? null;
}
