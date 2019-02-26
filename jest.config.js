module.exports = {
  verbose: true,
  "globals": {
    "ts-jest": {
      "tsConfig": "tsconfig.jest.json"
    }
  },
  "moduleNameMapper": {
    'app/core/utils/datemath': '<rootDir>/node_modules/grafana-sdk-mocks/app/core/utils/datemath.ts',
    'app/core/utils/kbn': '<rootDir>/src/__mocks__/kbn.ts',
    'app/plugins/sdk': '<rootDir>/node_modules/grafana-sdk-mocks/app/plugins/sdk.ts',
  },
  "transformIgnorePatterns": [
    "<rootDir>/node_modules/(?!grafana-sdk-mocks)"
  ],
  "transform": {
    ".(ts|tsx)": "ts-jest"
  },
  "testRegex": "(\\.|/)([jt]est)\\.ts$",
  "moduleFileExtensions": [
    "ts",
    "tsx",
    "js",
    "jsx",
    "json"
  ]
};
