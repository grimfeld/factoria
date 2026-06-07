import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const queryClient = new QueryClient({
  // Surface read failures once per query instead of silently rendering an empty
  // state — a blank screen with no message reads as "the app is broken".
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Only warn if there is no cached data to fall back on; a background
      // refetch that fails while showing stale data shouldn't nag the user.
      if (query.state.data !== undefined) return;
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`Couldn't load data. ${msg}`);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
