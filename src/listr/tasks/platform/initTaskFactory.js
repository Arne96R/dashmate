const { Listr } = require('listr2');

const Dash = require('dash');

const fundWallet = require('@dashevo/wallet-lib/src/utils/fundWallet');

const dpnsDocumentSchema = require('@dashevo/dpns-contract/schema/dpns-contract-documents.json');

/**
 *
 * @return {initTask}
 */
function initTaskFactory(
) {
  /**
   * @typedef {initTask}
   * @param {Config} config
   * @return {Listr}
   */
  function initTask(
    config,
  ) {
    const dpnsOwnerId = config.get('platform.dpns.ownerId');

    if (dpnsOwnerId !== null) {
      throw new Error(`DPNS owner ID ('platform.dpns.ownerId') is already set in ${config.getName()} config`);
    }

    const dpnsContractId = config.get('platform.dpns.contractId');

    if (dpnsContractId !== null) {
      throw new Error(`DPNS owner ID ('platform.dpns.contractId') is already set in ${config.getName()} config`);
    }

    return new Listr([
      {
        title: 'Initialize SDK',
        task: async (ctx, task) => {
          const clientOpts = {
            network: config.get('network'),
          };

          if (ctx.seed) {
            clientOpts.seeds = [ctx.seed];
          }

          const faucetClient = new Dash.Client({
            ...clientOpts,
            wallet: {
              privateKey: ctx.fundingPrivateKeyString,
            },
          });

          ctx.client = new Dash.Client({
            ...clientOpts,
            wallet: {
              mnemonic: null,
            },
          });

          const amount = 40000;

          await fundWallet(faucetClient.wallet, ctx.client.wallet, amount);

          await faucetClient.disconnect();

          // eslint-disable-next-line no-param-reassign
          task.output = `HD private key: ${ctx.client.wallet.exportWallet('HDPrivateKey')}`;
        },
        options: { persistentOutput: true },
      },
      {
        title: 'Register DPNS identity',
        task: async (ctx, task) => {
          ctx.identity = await ctx.client.platform.identities.register(5);

          config.set('platform.dpns.ownerId', ctx.identity.getId().toString());

          // eslint-disable-next-line no-param-reassign
          task.output = `DPNS identity: ${ctx.identity.getId().toString()}`;
        },
        options: { persistentOutput: true },
      },
      {
        title: 'Register DPNS contract',
        task: async (ctx, task) => {
          ctx.dataContract = await ctx.client.platform.contracts.create(
            dpnsDocumentSchema, ctx.identity,
          );

          await ctx.client.platform.contracts.broadcast(
            ctx.dataContract,
            ctx.identity,
          );

          config.set('platform.dpns.contractId', ctx.dataContract.getId().toString());

          // eslint-disable-next-line no-param-reassign
          task.output = `DPNS contract ID: ${ctx.dataContract.getId().toString()}`;
        },
        options: { persistentOutput: true },
      },
      {
        title: 'Register top level domain "dash"',
        task: async (ctx) => {
          ctx.client.getApps().set('dpns', {
            contractId: ctx.dataContract.getId(),
            contract: ctx.dataContract,
          });

          await ctx.client.platform.names.register('dash', {
            dashAliasIdentityId: ctx.identity.getId(),
          }, ctx.identity);
        },
      },
      {
        title: 'Disconnect SDK',
        task: async (ctx) => ctx.client.disconnect(),
      },
    ]);
  }

  return initTask;
}

module.exports = initTaskFactory;
