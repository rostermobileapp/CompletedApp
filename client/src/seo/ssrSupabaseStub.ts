// The static page renderer never runs effects or authenticated queries.
// Keep the browser Supabase client out of Node's prerender module graph.
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({
      data: { subscription: { unsubscribe() {} } },
    }),
  },
};

export async function clearStaleSession() {}
