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
exports.JunoRiskCheck = exports.ViolationBehaviour = void 0;
const juno_client_1 = require("@juno/juno-client");
const web3_js_1 = require("@solana/web3.js");
const anchor = __importStar(require("@project-serum/anchor"));
const anchor_1 = require("@project-serum/anchor");
const idl_json_1 = __importDefault(require("../idl.json"));
const pubkey_1 = require("@project-serum/anchor/dist/cjs/utils/pubkey");
const RISK_PARAMS_ACCOUNT_SEED_PHRASE = 'risk-check';
const DEFAULT_PROGRAM_ID = new web3_js_1.PublicKey('94oHQMrCECP266YUoQmDvgVwafZApP9KAseMyNtjAPP7');
var ViolationBehaviour;
(function (ViolationBehaviour) {
    ViolationBehaviour[ViolationBehaviour["RejectTransaction"] = 0] = "RejectTransaction";
    ViolationBehaviour[ViolationBehaviour["CancelAllOrders"] = 1] = "CancelAllOrders";
    ViolationBehaviour[ViolationBehaviour["CancelIncreasingOrders"] = 2] = "CancelIncreasingOrders";
})(ViolationBehaviour = exports.ViolationBehaviour || (exports.ViolationBehaviour = {}));
class JunoRiskCheck {
    constructor(args) {
        this._riskAccountCache = new Map();
        this._violationBehaviourEnumMap = new Map();
        const { programID, connection, junoAccount, junoGroup, junoClient } = args;
        this._owner = args.owner;
        this._connection = connection;
        this._junoAccount = junoAccount;
        this._junoGroup = junoGroup;
        this._junoClient = junoClient;
        this._programID = DEFAULT_PROGRAM_ID;
        if (programID) {
            this._programID = programID;
        }
        // TODO: This is a hack, as unsure how to use enums with Anchor's IDL
        this._violationBehaviourEnumMap.set(ViolationBehaviour.RejectTransaction, { rejectTransaction: {} });
        this._violationBehaviourEnumMap.set(ViolationBehaviour.CancelAllOrders, { cancelAllOrders: {} });
        this._violationBehaviourEnumMap.set(ViolationBehaviour.CancelIncreasingOrders, { cancelIncreasingOrders: {} });
        // TODO: What about the confirmation options? Probably should pass these in somehow
        const provider = new anchor.AnchorProvider(this._connection, new anchor.Wallet(this._owner), {});
        this._program = new anchor_1.Program(idl_json_1.default, this._programID, provider);
    }
    mapViolationBehaviour(violationBehaviour) {
        return this._violationBehaviourEnumMap.get(violationBehaviour);
    }
    uiToNativeQuantity(perpMarket, quantity) {
        const [_, nativeQuantity] = perpMarket.uiToNativePriceQuantity(0, quantity);
        return nativeQuantity;
    }
    deriveRiskAccountAddress(marketIndex) {
        return (0, pubkey_1.findProgramAddressSync)([
            anchor.utils.bytes.utf8.encode(RISK_PARAMS_ACCOUNT_SEED_PHRASE),
            new Uint8Array([marketIndex]),
            this._owner.publicKey.toBuffer()
        ], this._programID);
    }
    getRiskAccountAddress(perpMarketConfig) {
        const marketIndex = perpMarketConfig.marketIndex;
        if (!this._riskAccountCache.has(marketIndex)) {
            const [address, _] = this.deriveRiskAccountAddress(perpMarketConfig.marketIndex);
            this._riskAccountCache.set(marketIndex, address);
        }
        return this._riskAccountCache.get(marketIndex);
    }
    makeInitializeInstruction(perpMarketConfig) {
        const marketIndex = perpMarketConfig.marketIndex;
        const riskAccount = this.getRiskAccountAddress(perpMarketConfig);
        return this._program.instruction.initialize(marketIndex, {
            accounts: {
                riskParamsAccount: riskAccount,
                authority: this._owner.publicKey,
                systemProgram: web3_js_1.SystemProgram.programId
            }
        });
    }
    initializeRiskAccount(perpMarketConfig) {
        return __awaiter(this, void 0, void 0, function* () {
            const ix = this.makeInitializeInstruction(perpMarketConfig);
            const tx = new web3_js_1.Transaction();
            tx.add(ix);
            return yield this._program.provider.sendAndConfirm(tx);
        });
    }
    // TODO: How to get get right anchor typedefs?
    getRiskAccount(perpMarketConfig) {
        return __awaiter(this, void 0, void 0, function* () {
            const marketIndex = perpMarketConfig.marketIndex;
            const [riskAccount, _] = yield this.deriveRiskAccountAddress(marketIndex);
            return this._program.account.riskParamsAccount.fetch(riskAccount);
        });
    }
    makeSetMaxOpenOrdersInstruction(perpMarketConfig, maxOpenOrders) {
        if (maxOpenOrders < 0) {
            throw new Error('Invalid maximum order number');
        }
        const riskAccount = this.getRiskAccountAddress(perpMarketConfig);
        return this._program.instruction.setMaxOpenOrders(new juno_client_1.BN(maxOpenOrders), {
            accounts: {
                riskParamsAccount: riskAccount,
                authority: this._owner.publicKey,
                junoAccount: this._junoAccount.publicKey,
                junoGroup: this._junoGroup.publicKey,
                junoProgram: this._junoClient.programId
            }
        });
    }
    setMaxOpenOrders(perpMarketConfig, maxOpenOrders) {
        return __awaiter(this, void 0, void 0, function* () {
            const ix = this.makeSetMaxOpenOrdersInstruction(perpMarketConfig, maxOpenOrders);
            const tx = new web3_js_1.Transaction();
            tx.add(ix);
            return yield this._program.provider.sendAndConfirm(tx);
        });
    }
    makeSetMaxLongExposureInstruction(perpMarketConfig, perpMarket, maxLongExposure, nativeUnits = false) {
        if (nativeUnits && !(maxLongExposure instanceof juno_client_1.BN)) {
            throw new Error('Native units must use BigNumber (BN)');
        }
        if (!nativeUnits && maxLongExposure instanceof juno_client_1.BN) {
            throw new Error('Non-Native units must use Number');
        }
        if (!nativeUnits) {
            maxLongExposure = this.uiToNativeQuantity(perpMarket, maxLongExposure);
        }
        maxLongExposure = maxLongExposure;
        if (maxLongExposure.ltn(0)) {
            throw new Error('Invalid maximum long exposure');
        }
        const riskAccount = this.getRiskAccountAddress(perpMarketConfig);
        return this._program.instruction.setMaxLongExposure(maxLongExposure, {
            accounts: {
                riskParamsAccount: riskAccount,
                authority: this._owner.publicKey,
                junoAccount: this._junoAccount.publicKey,
                junoGroup: this._junoGroup.publicKey,
                junoProgram: this._junoClient.programId
            }
        });
    }
    setMaxLongExposure(perpMarketConfig, perpMarket, maxLongExposure, nativeUnits = false) {
        return __awaiter(this, void 0, void 0, function* () {
            const ix = this.makeSetMaxLongExposureInstruction(perpMarketConfig, perpMarket, maxLongExposure, nativeUnits);
            const tx = new web3_js_1.Transaction();
            tx.add(ix);
            return yield this._program.provider.sendAndConfirm(tx);
        });
    }
    makeSetMaxShortExposureInstruction(perpMarketConfig, perpMarket, maxShortExposure, nativeUnits = false) {
        if (nativeUnits && !(maxShortExposure instanceof juno_client_1.BN)) {
            throw new Error('Native units must use BigNumber (BN)');
        }
        if (!nativeUnits && maxShortExposure instanceof juno_client_1.BN) {
            throw new Error('Non-Native units must use Number');
        }
        if (!nativeUnits) {
            maxShortExposure = this.uiToNativeQuantity(perpMarket, maxShortExposure);
        }
        maxShortExposure = maxShortExposure;
        if (maxShortExposure.ltn(0)) {
            throw new Error('Invalid maximum short exposure');
        }
        const riskAccount = this.getRiskAccountAddress(perpMarketConfig);
        return this._program.instruction.setMaxShortExposure(maxShortExposure, {
            accounts: {
                riskParamsAccount: riskAccount,
                authority: this._owner.publicKey,
                junoAccount: this._junoAccount.publicKey,
                junoGroup: this._junoGroup.publicKey,
                junoProgram: this._junoClient.programId
            }
        });
    }
    setMaxShortExposure(perpMarketConfig, perpMarket, maxShortExposure, nativeUnits = false) {
        return __awaiter(this, void 0, void 0, function* () {
            const ix = this.makeSetMaxShortExposureInstruction(perpMarketConfig, perpMarket, maxShortExposure, nativeUnits);
            const tx = new web3_js_1.Transaction();
            tx.add(ix);
            return yield this._program.provider.sendAndConfirm(tx);
        });
    }
    makeSetViolationBehaviourInstruction(perpMarketConfig, violationBehaviour) {
        const riskAccount = this.getRiskAccountAddress(perpMarketConfig);
        const enumValue = this.mapViolationBehaviour(violationBehaviour);
        return this._program.instruction.setViolationBehaviour(enumValue, {
            accounts: {
                riskParamsAccount: riskAccount,
                authority: this._owner.publicKey,
                junoAccount: this._junoAccount.publicKey,
                junoGroup: this._junoGroup.publicKey,
                junoProgram: this._junoClient.programId
            }
        });
    }
    setViolationBehaviour(perpMarketConfig, violationBehaviour) {
        return __awaiter(this, void 0, void 0, function* () {
            const ix = this.makeSetViolationBehaviourInstruction(perpMarketConfig, violationBehaviour);
            const tx = new web3_js_1.Transaction();
            tx.add(ix);
            return yield this._program.provider.sendAndConfirm(tx);
        });
    }
    makeCheckRiskInstruction(perpMarketConfig, perpMarket) {
        const riskAccount = this.getRiskAccountAddress(perpMarketConfig);
        return this._program.instruction.checkRisk({
            accounts: {
                riskParamsAccount: riskAccount,
                authority: this._owner.publicKey,
                junoAccount: this._junoAccount.publicKey,
                junoGroup: this._junoGroup.publicKey,
                junoProgram: this._junoClient.programId,
                perpMarket: perpMarket.publicKey,
                perpMarketBids: perpMarket.bids,
                perpMarketAsks: perpMarket.asks
            }
        });
    }
    makeCloseRiskAccountInstruction(perpMarketConfig) {
        const riskAccount = this.getRiskAccountAddress(perpMarketConfig);
        return this._program.instruction.close({
            accounts: {
                riskParamsAccount: riskAccount,
                authority: this._owner.publicKey,
                systemProgram: web3_js_1.SystemProgram.programId
            }
        });
    }
    closeRiskAccount(perpMarketConfig) {
        return __awaiter(this, void 0, void 0, function* () {
            const ix = this.makeCloseRiskAccountInstruction(perpMarketConfig);
            const tx = new web3_js_1.Transaction();
            tx.add(ix);
            return yield this._program.provider.sendAndConfirm(tx);
        });
    }
}
exports.JunoRiskCheck = JunoRiskCheck;
