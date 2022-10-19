"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const juno_client_1 = require("@juno/juno-client");
const web3_js_1 = require("@solana/web3.js");
const lib_1 = require("../lib");
const ids_json_1 = __importDefault(require("@juno/juno-client/lib/src/ids.json"));
// NOTE: Testing in devnet is not ideal due to non-determinism, however initially at least did not have time to learn to do/set up full juno set up. 
// This should be possible however, so will likely migrate in the future.
// Set a high timeout as devnet can be slow
jest.setTimeout(30000);
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
const endpoint = (0, web3_js_1.clusterApiUrl)('devnet');
const connection = new web3_js_1.Connection(endpoint, 'confirmed');
const wallet = web3_js_1.Keypair.generate();
const config = new juno_client_1.Config(ids_json_1.default);
const groupConfig = config.getGroupWithName('devnet.2');
const client = new juno_client_1.JunoClient(connection, groupConfig.junoProgramId);
// Use SOL-PERP as testing wise this should be most stable with using native SOL as collateral
const perpConfig = (0, juno_client_1.getMarketByBaseSymbolAndKind)(groupConfig, 'SOL', 'perp');
const I64_MAX_BN = new juno_client_1.BN('9223372036854775807').toTwos(64);
const U64_MAX_BN = new juno_client_1.BN('ffffffffffffffff', 16);
let junoAccount;
let junoGroup;
let perpMarket;
let riskChecker;
let bestBid;
let bestAsk;
beforeAll(() => __awaiter(void 0, void 0, void 0, function* () {
    // Get money
    yield connection.requestAirdrop(wallet.publicKey, 2 * web3_js_1.LAMPORTS_PER_SOL);
    yield sleep(2000);
    // Create a Juno Account
    junoGroup = yield client.getJunoGroup(groupConfig.publicKey);
    const junoAccountAddress = yield client.createJunoAccount(junoGroup, wallet, 0);
    yield sleep(2000);
    junoAccount = yield client.getJunoAccount(junoAccountAddress, junoGroup.dexProgramId);
    riskChecker = new lib_1.JunoRiskCheck({
        owner: wallet,
        connection: connection,
        junoAccount: junoAccount,
        junoClient: client,
        junoGroup: junoGroup
    });
    // Drop some cash in the testing account
    const tokenAccounts = yield (0, juno_client_1.getTokenAccountsByOwnerWithWrappedSol)(connection, wallet.publicKey);
    yield junoGroup.loadRootBanks(connection);
    const tokenIndex = junoGroup.getTokenIndex(tokenAccounts[0].mint);
    const res = yield client.deposit(junoGroup, junoAccount, wallet, junoGroup.tokens[tokenIndex].rootBank, junoGroup.rootBankAccounts[tokenIndex].nodeBankAccounts[0].publicKey, junoGroup.rootBankAccounts[tokenIndex].nodeBankAccounts[0].vault, tokenAccounts[0].publicKey, 1.5);
    yield sleep(2000);
    // Figure out best bid/ask for tests. This is very janky, but can't think of easier option in devnet
    perpMarket = yield junoGroup.loadPerpMarket(connection, perpConfig.marketIndex, perpConfig.baseDecimals, perpConfig.quoteDecimals);
    const bids = yield perpMarket.loadBids(connection);
    const asks = yield perpMarket.loadAsks(connection);
    bestBid = bids.getBest().price;
    bestAsk = asks.getBest().price;
    console.log(`Symbol: SOL-PERP, bestBid: ${bestBid}, bestAsk: ${bestAsk}`);
}));
// NOTE: These tests MUST be run in sequence as they are not independent!
test('initialising risk account creates an account with default params', () => __awaiter(void 0, void 0, void 0, function* () {
    yield riskChecker.initializeRiskAccount(perpConfig);
    const newAcc = yield riskChecker.getRiskAccount(perpConfig);
    expect(newAcc.authority.toBase58()).toBe(wallet.publicKey.toBase58());
    expect(newAcc.marketIndex).toBe(perpConfig.marketIndex);
    expect(newAcc.maxLongExposure.eq(I64_MAX_BN)).toBe(true);
    expect(newAcc.maxShortExposure.eq(I64_MAX_BN)).toBe(true);
    expect(newAcc.maxOpenOrders.eq(U64_MAX_BN)).toBe(true);
    expect(newAcc.maxCapitalAllocated.eq(U64_MAX_BN)).toBe(true);
    expect(newAcc.violationBehaviour).toStrictEqual(riskChecker.mapViolationBehaviour(lib_1.ViolationBehaviour.RejectTransaction));
}));
test('Setting max open orders updates risk account', () => __awaiter(void 0, void 0, void 0, function* () {
    const tx = yield riskChecker.setMaxOpenOrders(perpConfig, 2);
    const riskAcc = yield riskChecker.getRiskAccount(perpConfig);
    expect(riskAcc.maxOpenOrders.toNumber()).toBe(2);
}));
test('Placing open orders below maximum order limit is allowed', () => __awaiter(void 0, void 0, void 0, function* () {
    // Place orders deep in book
    const bidPrice = bestBid - 1;
    const askPrice = bestAsk + 1;
    yield client.placePerpOrder2(junoGroup, junoAccount, perpMarket, wallet, 'buy', bidPrice, 0.1);
    yield client.placePerpOrder2(junoGroup, junoAccount, perpMarket, wallet, 'sell', askPrice, 0.1);
    const openOrders = yield perpMarket.loadOrdersForAccount(connection, junoAccount);
    expect(openOrders.length).toBe(2);
}));
test('Setting max open orders below open orders is rejected', () => __awaiter(void 0, void 0, void 0, function* () {
    const openOrders = yield perpMarket.loadOrdersForAccount(connection, junoAccount);
    expect(openOrders.length).toBe(2);
    return expect(riskChecker.setMaxOpenOrders(perpConfig, 1))
        .rejects
        .toThrow('failed to send transaction: Transaction simulation failed: Error processing Instruction 0: custom program error: 0x1770');
}));
test('Placing another order in excess of max open orders rejects transaction', () => {
    const tx = new web3_js_1.Transaction();
    tx.add(makePerpOrderInstruction('buy', bestBid - 1, 0.1));
    tx.add(riskChecker.makeCheckRiskInstruction(perpConfig, perpMarket));
    return expect(client.sendTransaction(tx, wallet, []))
        .rejects
        .toThrow('Transaction failed: AnchorError occurred. Error Code: NumOpenOrdersExceedsRiskLimit. Error Number: 6001. Error Message: Number of open orders exceeds risk limit.');
});
test('Setting max long exposure updates risk account', () => __awaiter(void 0, void 0, void 0, function* () {
    yield riskChecker.setMaxLongExposure(perpConfig, perpMarket, 0.5);
    const riskAcc = yield riskChecker.getRiskAccount(perpConfig);
    expect(riskAcc.maxLongExposure.toNumber()).toBe(50);
    yield riskChecker.setMaxLongExposure(perpConfig, perpMarket, new juno_client_1.BN(5000), true);
    const riskAcc2 = yield riskChecker.getRiskAccount(perpConfig);
    expect(riskAcc2.maxLongExposure.toNumber()).toBe(5000);
}));
test('Acquiring position and orders below long exposure is permitted', () => __awaiter(void 0, void 0, void 0, function* () {
    yield riskChecker.setMaxLongExposure(perpConfig, perpMarket, 1);
    const riskAcc = yield riskChecker.getRiskAccount(perpConfig);
    expect(riskAcc.maxLongExposure.toNumber()).toBe(100);
    // Acquire a position by using aggressive order and place passive order up to limit
    const tx = new web3_js_1.Transaction();
    tx.add(makeCancelAllInstruction());
    tx.add(makePerpOrderInstruction('buy', bestAsk + 1, 0.7, 'market'));
    tx.add(makePerpOrderInstruction('buy', bestBid - 1, 0.3));
    tx.add(riskChecker.makeCheckRiskInstruction(perpConfig, perpMarket));
    yield client.sendTransaction(tx, wallet, []);
    expect((yield perpMarket.loadFills(connection)).length).toBeGreaterThan(0);
    const openOrders2 = yield perpMarket.loadOrdersForAccount(connection, junoAccount);
    expect(openOrders2.length).toBe(1);
    // FIXME: Can't get the below to confirm the position reliably due to flakiness registering position.
    // Consume events to get the position up to date
    // await client.consumeEvents(junoGroup,perpMarket,[junoAccount.publicKey],deprecatedAccount,new BN(1000))
    // await junoAccount.reload(connection) // Refresh position
    // const position = junoAccount.getPerpPositionUi(perpConfig.marketIndex,perpMarket)
    // expect(position).toBe(0.7)
    // expect(openOrders2[0].size).toBeCloseTo(0.3,4)
}));
test('Acquiring position and orders beyond long exposure is rejected', () => __awaiter(void 0, void 0, void 0, function* () {
    // NOTE: Already have a position of 0.7 here!
    yield riskChecker.setMaxLongExposure(perpConfig, perpMarket, 1);
    const riskAcc = yield riskChecker.getRiskAccount(perpConfig);
    expect(riskAcc.maxLongExposure.toNumber()).toBe(100);
    // Acquire a position by using aggressive order beyond the limit
    const tx = new web3_js_1.Transaction();
    tx.add(makeCancelAllInstruction());
    tx.add(makePerpOrderInstruction('buy', bestAsk + 1, 0.4, 'market'));
    tx.add(riskChecker.makeCheckRiskInstruction(perpConfig, perpMarket));
    yield expect(client.sendTransaction(tx, wallet, []))
        .rejects
        .toThrow('Transaction failed: AnchorError occurred. Error Code: LongExposureExceedsRiskLimit. Error Number: 6003. Error Message: Long exposure exceeds risk limit.');
    // Place a long order beyond the limit
    const tx2 = new web3_js_1.Transaction();
    tx2.add(makeCancelAllInstruction());
    tx2.add(makePerpOrderInstruction('buy', bestBid - 1, 0.4));
    tx2.add(riskChecker.makeCheckRiskInstruction(perpConfig, perpMarket));
    return expect(client.sendTransaction(tx2, wallet, []))
        .rejects
        .toThrow('Transaction failed: AnchorError occurred. Error Code: LongExposureExceedsRiskLimit. Error Number: 6003. Error Message: Long exposure exceeds risk limit.');
}));
test('Setting max long exposure beyond risk limit rejects', () => __awaiter(void 0, void 0, void 0, function* () {
    // NOTE: Already have a position of 0.7 here!
    return expect(riskChecker.setMaxLongExposure(perpConfig, perpMarket, 0.5)) // 0.7 > 0.5
        .rejects
        .toThrow('failed to send transaction: Transaction simulation failed: Error processing Instruction 0: custom program error: 0x1772');
}));
test('Setting max short exposure updates risk account', () => __awaiter(void 0, void 0, void 0, function* () {
    yield riskChecker.setMaxShortExposure(perpConfig, perpMarket, 0.5);
    const riskAcc = yield riskChecker.getRiskAccount(perpConfig);
    expect(riskAcc.maxShortExposure.toNumber()).toBe(50);
    yield riskChecker.setMaxShortExposure(perpConfig, perpMarket, new juno_client_1.BN(5000), true);
    const riskAcc2 = yield riskChecker.getRiskAccount(perpConfig);
    expect(riskAcc2.maxShortExposure.toNumber()).toBe(5000);
}));
test('Acquiring position and orders below short exposure is permitted', () => __awaiter(void 0, void 0, void 0, function* () {
    yield riskChecker.setMaxShortExposure(perpConfig, perpMarket, 1);
    const riskAcc = yield riskChecker.getRiskAccount(perpConfig);
    expect(riskAcc.maxShortExposure.toNumber()).toBe(100);
    // Acquire a position by using aggressive order and place passive order up to limit
    const tx = new web3_js_1.Transaction();
    tx.add(makeCancelAllInstruction());
    tx.add(makePerpOrderInstruction('sell', bestBid - 1, 1.4, 'market')); // Need to sell past the original 0.7 long position
    tx.add(makePerpOrderInstruction('sell', bestAsk + 1, 0.3));
    tx.add(riskChecker.makeCheckRiskInstruction(perpConfig, perpMarket));
    yield client.sendTransaction(tx, wallet, []);
    expect((yield perpMarket.loadFills(connection)).length).toBeGreaterThan(0);
    const openOrders2 = yield perpMarket.loadOrdersForAccount(connection, junoAccount);
    expect(openOrders2.length).toBe(1);
}));
test('Acquiring position and orders beyond short exposure is rejected', () => __awaiter(void 0, void 0, void 0, function* () {
    // NOTE: Already have a position of -0.7 here!
    yield riskChecker.setMaxShortExposure(perpConfig, perpMarket, 1);
    const riskAcc = yield riskChecker.getRiskAccount(perpConfig);
    expect(riskAcc.maxShortExposure.toNumber()).toBe(100);
    // Acquire a position by using aggressive order beyond the limit
    const tx = new web3_js_1.Transaction();
    tx.add(makeCancelAllInstruction());
    tx.add(makePerpOrderInstruction('sell', bestBid - 1, 0.4, 'market'));
    tx.add(riskChecker.makeCheckRiskInstruction(perpConfig, perpMarket));
    yield expect(client.sendTransaction(tx, wallet, []))
        .rejects
        .toThrow('Transaction failed: AnchorError occurred. Error Code: ShortExposureExceedsRiskLimit. Error Number: 6005. Error Message: Short exposure exceeds risk limit.');
    // Place a short order beyond the limit
    const tx2 = new web3_js_1.Transaction();
    tx2.add(makeCancelAllInstruction());
    tx2.add(makePerpOrderInstruction('sell', bestAsk + 1, 0.4));
    tx2.add(riskChecker.makeCheckRiskInstruction(perpConfig, perpMarket));
    return expect(client.sendTransaction(tx2, wallet, []))
        .rejects
        .toThrow('Transaction failed: AnchorError occurred. Error Code: ShortExposureExceedsRiskLimit. Error Number: 6005. Error Message: Short exposure exceeds risk limit.');
}));
test('Setting max short exposure beyond risk limit rejects', () => __awaiter(void 0, void 0, void 0, function* () {
    // NOTE: Already have a position of -0.7 here!
    return expect(riskChecker.setMaxShortExposure(perpConfig, perpMarket, 0.5)) // 0.7 > 0.5
        .rejects
        .toThrow('failed to send transaction: Transaction simulation failed: Error processing Instruction 0: custom program error: 0x1774');
}));
test('Setting violation behaviour updates risk account', () => __awaiter(void 0, void 0, void 0, function* () {
    const tx = yield riskChecker.setViolationBehaviour(perpConfig, lib_1.ViolationBehaviour.CancelAllOrders);
    const riskAcc = yield riskChecker.getRiskAccount(perpConfig);
    return expect(riskAcc.violationBehaviour).toStrictEqual(riskChecker.mapViolationBehaviour(lib_1.ViolationBehaviour.CancelAllOrders));
}));
test('Violating short exposure with cancelAllOrders behaviour cancels all orders but does not reject', () => __awaiter(void 0, void 0, void 0, function* () {
    // NOTE: Already have a position of -0.7 here!
    yield riskChecker.setViolationBehaviour(perpConfig, lib_1.ViolationBehaviour.CancelAllOrders);
    yield riskChecker.setMaxShortExposure(perpConfig, perpMarket, 1);
    // Place a passive sell order below risk limit
    const tx = new web3_js_1.Transaction();
    tx.add(makeCancelAllInstruction());
    tx.add(makePerpOrderInstruction('sell', bestAsk + 1, 0.1));
    tx.add(riskChecker.makeCheckRiskInstruction(perpConfig, perpMarket));
    yield client.sendTransaction(tx, wallet, []);
    let openOrders = yield perpMarket.loadOrdersForAccount(connection, junoAccount);
    expect(openOrders.length).toBe(1);
    // Place a short order beyond the limit
    const tx2 = new web3_js_1.Transaction();
    tx2.add(makePerpOrderInstruction('sell', bestAsk + 1, 0.4));
    tx2.add(riskChecker.makeCheckRiskInstruction(perpConfig, perpMarket));
    yield expect(client.sendTransaction(tx2, wallet, []));
    yield sleep(5000); // TODO: Why is this needed? Seems like it doesn't appear to cancel right away? Find out why.
    openOrders = yield perpMarket.loadOrdersForAccount(connection, junoAccount);
    expect(openOrders.length).toBe(0);
}));
test('Violating short exposure with cancelIncreasingOrders behaviour cancels all sell orders but does not reject', () => __awaiter(void 0, void 0, void 0, function* () {
    // NOTE: Already have a position of -0.7 here!
    yield riskChecker.setMaxOpenOrders(perpConfig, 4);
    yield riskChecker.setViolationBehaviour(perpConfig, lib_1.ViolationBehaviour.CancelIncreasingOrders);
    yield riskChecker.setMaxShortExposure(perpConfig, perpMarket, 1);
    // Place a passive buy and sell orders below risk limit
    const tx = new web3_js_1.Transaction();
    tx.add(makeCancelAllInstruction());
    tx.add(makePerpOrderInstruction('sell', bestAsk + 1, 0.1));
    tx.add(makePerpOrderInstruction('buy', bestBid - 1, 0.1));
    tx.add(riskChecker.makeCheckRiskInstruction(perpConfig, perpMarket));
    yield client.sendTransaction(tx, wallet, []);
    let openOrders = yield perpMarket.loadOrdersForAccount(connection, junoAccount);
    expect(openOrders.length).toBe(2);
    // Place a short order beyond the limit
    const tx2 = new web3_js_1.Transaction();
    tx2.add(makePerpOrderInstruction('sell', bestAsk + 1, 0.4));
    tx2.add(riskChecker.makeCheckRiskInstruction(perpConfig, perpMarket));
    yield expect(client.sendTransaction(tx2, wallet, []));
    yield sleep(5000);
    // Only the buy order (decreasing) should be left
    openOrders = yield perpMarket.loadOrdersForAccount(connection, junoAccount);
    expect(openOrders.length).toBe(1);
    expect(openOrders[0].side).toBe('buy');
}));
test('Violating long exposure with cancelIncreasingOrders behaviour cancels all buy orders but does not reject', () => __awaiter(void 0, void 0, void 0, function* () {
    // NOTE: Already have a position of -0.7 here!
    yield riskChecker.setMaxOpenOrders(perpConfig, 4);
    yield riskChecker.setViolationBehaviour(perpConfig, lib_1.ViolationBehaviour.CancelIncreasingOrders);
    yield riskChecker.setMaxLongExposure(perpConfig, perpMarket, 1);
    // Place a passive buy and sell orders below risk limit
    const tx = new web3_js_1.Transaction();
    tx.add(makeCancelAllInstruction());
    tx.add(makePerpOrderInstruction('sell', bestAsk + 1, 0.1));
    tx.add(makePerpOrderInstruction('buy', bestBid - 1, 1.4));
    tx.add(riskChecker.makeCheckRiskInstruction(perpConfig, perpMarket));
    yield client.sendTransaction(tx, wallet, []);
    let openOrders = yield perpMarket.loadOrdersForAccount(connection, junoAccount);
    expect(openOrders.length).toBe(2);
    // Place a long order beyond the limit
    const tx2 = new web3_js_1.Transaction();
    tx2.add(makePerpOrderInstruction('buy', bestBid - 1, 0.4));
    tx2.add(riskChecker.makeCheckRiskInstruction(perpConfig, perpMarket));
    yield expect(client.sendTransaction(tx2, wallet, []));
    yield sleep(5000);
    // Only the sell order (decreasing) should be left
    openOrders = yield perpMarket.loadOrdersForAccount(connection, junoAccount);
    expect(openOrders.length).toBe(1);
    expect(openOrders[0].side).toBe('sell');
}));
test('Violating long AND short exposure with cancelIncreasingOrders behaviour cancels all buy and sell orders but does not reject', () => __awaiter(void 0, void 0, void 0, function* () {
    // NOTE: Already have a position of -0.7 here!
    yield riskChecker.setMaxOpenOrders(perpConfig, 4);
    yield riskChecker.setViolationBehaviour(perpConfig, lib_1.ViolationBehaviour.CancelIncreasingOrders);
    yield riskChecker.setMaxShortExposure(perpConfig, perpMarket, 1);
    yield riskChecker.setMaxLongExposure(perpConfig, perpMarket, 1);
    // Place a passive buy and sell orders below risk limit
    const tx = new web3_js_1.Transaction();
    tx.add(makeCancelAllInstruction());
    tx.add(makePerpOrderInstruction('sell', bestAsk + 1, 0.1));
    tx.add(makePerpOrderInstruction('buy', bestBid - 1, 1.4));
    tx.add(riskChecker.makeCheckRiskInstruction(perpConfig, perpMarket));
    yield client.sendTransaction(tx, wallet, []);
    let openOrders = yield perpMarket.loadOrdersForAccount(connection, junoAccount);
    expect(openOrders.length).toBe(2);
    // Place a long order beyond the limit
    const tx2 = new web3_js_1.Transaction();
    tx2.add(makePerpOrderInstruction('buy', bestBid - 1, 0.4));
    tx2.add(makePerpOrderInstruction('sell', bestAsk + 1, 0.4));
    tx2.add(riskChecker.makeCheckRiskInstruction(perpConfig, perpMarket));
    yield expect(client.sendTransaction(tx2, wallet, []));
    yield sleep(5000);
    // Both buy and sell orders should be canceled
    openOrders = yield perpMarket.loadOrdersForAccount(connection, junoAccount);
    expect(openOrders.length).toBe(0);
}));
test('Closing risk account returns SOL and removes the account', () => __awaiter(void 0, void 0, void 0, function* () {
    const prevBalance = yield connection.getBalance(wallet.publicKey);
    yield riskChecker.closeRiskAccount(perpConfig);
    const newBalance = yield connection.getBalance(wallet.publicKey);
    yield sleep(5000);
    expect(newBalance).toBeGreaterThan(prevBalance);
    yield expect(riskChecker.getRiskAccount(perpConfig))
        .rejects
        .toThrow(new RegExp('Account does not exist .*'));
}));
// Utils
function makeCancelAllInstruction() {
    return (0, juno_client_1.makeCancelAllPerpOrdersInstruction)(groupConfig.junoProgramId, junoGroup.publicKey, junoAccount.publicKey, wallet.publicKey, perpMarket.publicKey, perpMarket.bids, perpMarket.asks, new juno_client_1.BN(20));
}
function makePerpOrderInstruction(side, price, size, orderType = 'limit') {
    const [nativePrice, nativeQuantity] = perpMarket.uiToNativePriceQuantity(price, size);
    return (0, juno_client_1.makePlacePerpOrder2Instruction)(groupConfig.junoProgramId, junoGroup.publicKey, junoAccount.publicKey, wallet.publicKey, junoGroup.junoCache, perpMarket.publicKey, perpMarket.bids, perpMarket.asks, perpMarket.eventQueue, junoAccount.getOpenOrdersKeysInBasketPacked(), nativePrice, nativeQuantity, I64_MAX_BN, new juno_client_1.BN(0), side, new juno_client_1.BN(20), orderType, false, undefined, juno_client_1.ZERO_BN);
}
