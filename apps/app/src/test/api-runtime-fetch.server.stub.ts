export const runtimeApiFetchServer: typeof fetch = () => {
  throw new Error("Server API fetch is not available in browser tests.");
};
