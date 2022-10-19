"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const juno_client_1 = require("@juno/-client");
const ids_json_1 = __importDefault(require("@juno/juno-client/lib/src/ids.json"));
const web3_js_1 = require("@solana/web3.js");
const lib_1 = require("../lib");
const I64_MAX_BN = new juno_client_1.BN('9223372036854775807').toTwos(64);
function readKeypair() {
    return JSON.parse(process.env.KEYPAIR ||
        fs.readFileSync(os.homedir() + '/.config/solana/devnet.json', 'utf-8'));
}
function example() {
    return __awaiter(this, void 0, void 0, function* () {
        // setup client
        const config = new juno_client_1.Config(ids_json_1.default);
        const groupConfig = config.getGroupWithName('devnet.2');
        const connection = new web3_js_1.Connection(config.cluster_urls[groupConfig.cluster], 'processed');
        const client = new juno_client_1.JunoClient(connection, groupConfig.junoProgramId);
        // load group & market
        const perpMarketConfig = (0, juno_client_1.getMarketByBaseSymbolAndKind)(groupConfig, 'SOL', 'perp');
        const junoGroup = yield client.getJunoGroup(groupConfig.publicKey);
        const perpMarket = yield junoGroup.loadPerpMarket(connection, perpMarketConfig.marketIndex, perpMarketConfig.baseDecimals, perpMarketConfig.quoteDecimals);
        const owner = new web3_js_1.Keypair(readKeypair());
        const junoAccount = (yield client.getJunoAccountsForOwner(junoGroup, owner.publicKey))[0];
        // Create the risk checker
        const riskChecker = new lib_1.JunoRiskCheck({
            connection: connection,
            junoAccount: junoAccount,
            junoClient: client,
            junoGroup: junoGroup,
            owner: owner,
            // programID: new PublicKey('94oHQMrCECP266YUoQmDvgVwafZApP9KAseMyNtjAPP7') // can provide a custom programID
        });
        // Create a risk params account for our perp market
        yield riskChecker.initializeRiskAccount(perpMarketConfig);
        // Set the maximum number of open orders
        yield riskChecker.setMaxOpenOrders(perpMarketConfig, 10);
        // Set the maximum long exposure in UI units
        yield riskChecker.setMaxLongExposure(perpMarketConfig, perpMarket, 5.5); // Maximum long position of 5.5 SOL
        // Set the above, but using native units
        yield riskChecker.setMaxLongExposure(perpMarketConfig, perpMarket, new juno_client_1.BN(550), true);
        // Set the maximum short exposure in UI units
        yield riskChecker.setMaxShortExposure(perpMarketConfig, perpMarket, 3.5); // Maximum short position of 3.5 SOL
        // Set the violation behaviour. This is what the program will do if there is a risk violation
        //   RejectTransaction: Rejects the whole transaction
        //   CancelAllOrders:   Tries to cancel all the orders if this would reduce the risk below the limit, otherwise reject
        yield riskChecker.setViolationBehaviour(perpMarketConfig, lib_1.ViolationBehaviour.CancelAllOrders);
        // All instructions are available for composition
        const instruction = riskChecker.makeSetViolationBehaviourInstruction(perpMarketConfig, lib_1.ViolationBehaviour.CancelAllOrders);
        // How to compose a cancel all an order and a risk check
        const tx = new web3_js_1.Transaction();
        tx.add((0, juno_client_1.makeCancelAllPerpOrdersInstruction)(groupConfig.junoProgramId, junoGroup.publicKey, junoAccount.publicKey, owner.publicKey, perpMarket.publicKey, perpMarket.bids, perpMarket.asks, new juno_client_1.BN(20)));
        tx.add((0, juno_client_1.makePlacePerpOrder2Instruction)(groupConfig.junoProgramId, junoGroup.publicKey, junoAccount.publicKey, owner.publicKey, junoGroup.junoCache, perpMarket.publicKey, perpMarket.bids, perpMarket.asks, perpMarket.eventQueue, junoAccount.getOpenOrdersKeysInBasketPacked(), new juno_client_1.BN(100), new juno_client_1.BN(10), I64_MAX_BN, new juno_client_1.BN(0), 'buy', new juno_client_1.BN(20), 'limit', false, undefined, juno_client_1.ZERO_BN));
        // VERY IMPORTANT!!!
        // CheckRisk must be the last transaction
        tx.add(riskChecker.makeCheckRiskInstruction(perpMarketConfig, perpMarket));
        // Send the transaction
        yield client.sendTransaction(tx, owner, []);
        // Get the current risk account
        console.log(yield riskChecker.getRiskAccount(perpMarketConfig));
        // Close the risk account to get the SOL rent back
        yield riskChecker.closeRiskAccount(perpMarketConfig);
    });
}
example();
