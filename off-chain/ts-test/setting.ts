type NetworkConfig = {
    network: "Preview" | "Preprod" | "Mainnet";
    blockfrostURL: string | undefined;
    blockfrostAPIkey: string | undefined;
    workspacePath: string | undefined;
};

export const networkConfig: NetworkConfig = {
    network: "Preview",
    blockfrostURL: "https://cardano-preview.blockfrost.io/api/v0",
    blockfrostAPIkey: "preview1HbXrY2YsGblztV4vvPKaqoDUPvzAbMX",
    workspacePath: "/Users/taniasaleem/Documents/Learning/Aiken/paymentchannels",
};
// project_id: preview1HbXrY2YsGblztV4vvPKaqoDUPvzAbMX
