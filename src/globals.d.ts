type RequireConfig = {
  paths?: { [key: string]: any; } | undefined;
};

declare const requirejs: {
  config: (config: RequireConfig) => void,
};
