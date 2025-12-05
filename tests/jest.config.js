export default {
  transform: {},
  testTimeout: 300000,
  maxWorkers: 1,
  verbose: true,
  testPathIgnorePatterns: process.env.TEST_GUARD_CREATE_WALLET
  // Ignore everything except multisig-guard-create-wallet.test.js
    ? ["^(?!.*multisig-guard-create-wallet\\.test\\.js$)"]
    // Ignore multisig-guard-create-wallet.test.js
    : ["multisig-guard-create-wallet.test.js"],
};
