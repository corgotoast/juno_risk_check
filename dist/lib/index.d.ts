import { BN, JunoAccount, JunoClient, JunoGroup, PerpMarket, PerpMarketConfig } from '@juno/juno-client';
import { PublicKey, Keypair, Connection, TransactionInstruction } from '@solana/web3.js';
export declare enum ViolationBehaviour {
    RejectTransaction = 0,
    CancelAllOrders = 1,
    CancelIncreasingOrders = 2
}
interface NewJunoRiskCheckArgs {
    owner: Keypair;
    connection: Connection;
    junoAccount: JunoAccount;
    junoGroup: JunoGroup;
    junoClient: JunoClient;
    programID?: PublicKey;
}
export declare class JunoRiskCheck {
    private _programID;
    private _connection;
    private _owner;
    private _program;
    private _junoGroup;
    private _junoAccount;
    private _junoClient;
    private _riskAccountCache;
    private _violationBehaviourEnumMap;
    constructor(args: NewJunoRiskCheckArgs);
    mapViolationBehaviour(violationBehaviour: ViolationBehaviour): any;
    uiToNativeQuantity(perpMarket: PerpMarket, quantity: number): BN;
    deriveRiskAccountAddress(marketIndex: number): [PublicKey, number];
    getRiskAccountAddress(perpMarketConfig: PerpMarketConfig): PublicKey;
    makeInitializeInstruction(perpMarketConfig: PerpMarketConfig): TransactionInstruction;
    initializeRiskAccount(perpMarketConfig: PerpMarketConfig): Promise<string>;
    getRiskAccount(perpMarketConfig: PerpMarketConfig): Promise<any>;
    makeSetMaxOpenOrdersInstruction(perpMarketConfig: PerpMarketConfig, maxOpenOrders: number): TransactionInstruction;
    setMaxOpenOrders(perpMarketConfig: PerpMarketConfig, maxOpenOrders: number): Promise<string>;
    makeSetMaxLongExposureInstruction(perpMarketConfig: PerpMarketConfig, perpMarket: PerpMarket, maxLongExposure: number | BN, nativeUnits?: boolean): TransactionInstruction;
    setMaxLongExposure(perpMarketConfig: PerpMarketConfig, perpMarket: PerpMarket, maxLongExposure: number | BN, nativeUnits?: boolean): Promise<string>;
    makeSetMaxShortExposureInstruction(perpMarketConfig: PerpMarketConfig, perpMarket: PerpMarket, maxShortExposure: number | BN, nativeUnits?: boolean): TransactionInstruction;
    setMaxShortExposure(perpMarketConfig: PerpMarketConfig, perpMarket: PerpMarket, maxShortExposure: number | BN, nativeUnits?: boolean): Promise<string>;
    makeSetViolationBehaviourInstruction(perpMarketConfig: PerpMarketConfig, violationBehaviour: ViolationBehaviour): TransactionInstruction;
    setViolationBehaviour(perpMarketConfig: PerpMarketConfig, violationBehaviour: ViolationBehaviour): Promise<string>;
    makeCheckRiskInstruction(perpMarketConfig: PerpMarketConfig, perpMarket: PerpMarket): TransactionInstruction;
    makeCloseRiskAccountInstruction(perpMarketConfig: PerpMarketConfig): TransactionInstruction;
    closeRiskAccount(perpMarketConfig: PerpMarketConfig): Promise<string>;
}
export {};
