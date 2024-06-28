require('dotenv').config();
const { ethers } = require("ethers")
const { Route, Pair, Trade } = require("@uniswap/v2-sdk")
const fs = require('fs');
const { ChainId, Token, WETH9, CurrencyAmount, TradeType, Percent } = require("@uniswap/sdk-core");

const HTTP_ENDPOINT = process.env.RPC_URL
const privateKey = process.env.PRIVATE_KEY

let provider = new ethers.providers.getDefaultProvider(HTTP_ENDPOINT)
const wallet = new ethers.Wallet(privateKey, provider)

UNISWAP_ROUTER_ADDRESS = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24"
UNISWAP_ROUTER_ABI = fs.readFileSync("./abis/router.json").toString()
UNISWAP_ROUTER_CONTRACT = new ethers.Contract(UNISWAP_ROUTER_ADDRESS, UNISWAP_ROUTER_ABI, provider)


async function createPair(tokenA, tokenB) {
    const pairAddress = Pair.getAddress(tokenA, tokenB);

    const pairContract = new ethers.Contract(pairAddress, [
        'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
        'function token0() external view returns (address)',
        'function erc20Token() external view returns (address)'
    ], provider);

    const reserves = await pairContract.getReserves();
    const [reserve0, reserve1] = reserves;

    const tokens = [tokenA, tokenB];
    const [token0, token1] = tokens[0].sortsBefore(tokens[1]) ? tokens : [tokens[1], tokens[0]];

    const pair = new Pair(CurrencyAmount.fromRawAmount(token0, reserve0), CurrencyAmount.fromRawAmount(token1, reserve1));
    return pair;
}

async function swap(tokenObj, amount, slippage, direction) {
    let result;
    if (direction == 'in') {
        result = await swapEthForTokens(tokenObj, amount, slippage);
    } else {

        result = await swapTokensForEth(tokenObj, amount, slippage);
    }

    return result;
}


async function swapEthForTokens(tokenObj, amount, slippage = "50") {
    try {
        const erc20Token = new Token(
            tokenObj.chainId,
            tokenObj.address,
            tokenObj.decimals
        );

        const ethereum = WETH9[`${erc20Token.chainId}`];

        const pair = await createPair(erc20Token, ethereum)
        const route = new Route([pair], ethereum, erc20Token); // a fully specified path from input token to output token
        let amountIn = ethers.utils.parseEther(amount.toString()); //helper function to convert ETH to Wei
        amountIn = amountIn.toString()

        const slippageTolerance = new Percent(slippage, "10000"); // 50 bips, or 0.50% - Slippage tolerance
        const trade = new Trade(route, CurrencyAmount.fromRawAmount(ethereum, amountIn), TradeType.EXACT_INPUT);

        const amountOutMinWei = ethers.utils.parseUnits(trade.minimumAmountOut(slippageTolerance).toExact(), erc20Token.decimals);
        const amountOutMinHex = ethers.BigNumber.from(amountOutMinWei.toString()).toHexString();
        const path = [ethereum.address, erc20Token.address]; //An array of token addresses
        const to = wallet.address; // should be a checksummed recipient address
        const deadline = Math.floor(Date.now() / 1000) + 60 * 2; // 20 minutes from the current Unix time
        const gasLimit = ethers.utils.parseUnits("200000", "wei");
        const valueWei = ethers.utils.parseUnits(trade.inputAmount.toExact(), 18);
        const valueHex = ethers.BigNumber.from(valueWei.toString()).toHexString(); //convert to hex string
        const gasPrice = ethers.utils.parseUnits("0.1", "gwei");


        const nonce = await provider.getTransactionCount(wallet.address);
        const newNonce = nonce;
        //Return a copy of transactionRequest, The default implementation calls checkTransaction and resolves to if it is an ENS name, adds gasPrice, nonce, gasLimit and chainId based on the related operations on Signer.
        const rawTxn = await UNISWAP_ROUTER_CONTRACT.populateTransaction.swapExactETHForTokens(amountOutMinHex, path, to, deadline, {
            value: valueHex,
            gasLimit: gasLimit,
            gasPrice: gasPrice,
            nonce: newNonce
        })

        //Returns a Promise which resolves to the transaction.
        let sendTxn = (wallet).sendTransaction(rawTxn)


        //Resolves to the TransactionReceipt once the transaction has been included in the chain for x confirms blocks.
        let reciept = (await sendTxn).wait()

        //Logs the information about the transaction it has been mined.
        if (reciept) {
            const hash = (await sendTxn).hash;
            return hash;
        } else {
            console.log("Error submitting transaction")
        }

    } catch (e) {
        console.error(e)
    }
}


async function swapTokensForEth(tokenObj, amount, slippage = "50") {
    try {
        const erc20Token = new Token(
            tokenObj.chainId,
            tokenObj.address,
            tokenObj.decimals
        );

        const ethereum = WETH9[erc20Token.chainId];

        const tokenAbi = fs.readFileSync("./abis/token.json").toString();
        const daiContract = new ethers.Contract(erc20Token.address, tokenAbi, wallet)

        const pair = await createPair(erc20Token, ethereum)
        const route = new Route([pair], erc20Token, ethereum); // a fully specified path from input token to output token
        let amountIn = ethers.utils.parseUnits(amount.toString()); //helper function to convert ETH to Wei
        amountIn = amountIn.toString()

        const slippageTolerance = new Percent(slippage, "10000"); // 50 bips, or 0.50% - Slippage tolerance
        const trade = new Trade(route, CurrencyAmount.fromRawAmount(erc20Token, amountIn), TradeType.EXACT_INPUT);

        const amountOut = trade.minimumAmountOut(slippageTolerance).toExact(); // needs to be converted to e.g. hex
        const amountOutMinWei = ethers.utils.parseUnits(amountOut, 18);
        const amountOutMinHex = ethers.BigNumber.from(amountOutMinWei.toString()).toHexString();
        const path = [erc20Token.address, ethereum.address]; //An array of token addresses

        const to = wallet.address; // should be a checksummed recipient address
        const deadline = Math.floor(Date.now() / 1000) + 60 * 2; // 20 minutes from the current Unix time
        const gasLimit = ethers.utils.parseUnits("300000", "wei");
        const gasPrice = ethers.utils.parseUnits("0.1", "gwei");
        const gasPrice2 = ethers.utils.parseUnits("0.1", "gwei");
        const valueWei = trade.inputAmount.toExact() * 10 ** Number(erc20Token.decimals);

        const valueHex = ethers.BigNumber.from(valueWei.toLocaleString('fullwide', { useGrouping: false })).toHexString(); //convert to hex string

        const nonce = await provider.getTransactionCount(wallet.address);

        await daiContract.approve(UNISWAP_ROUTER_ADDRESS, valueHex, { gasPrice: gasPrice, nonce: nonce, gasLimit: gasLimit });


        //Return a copy of transactionRequest, The default implementation calls checkTransaction and resolves to if it is an ENS name, adds gasPrice, nonce, gasLimit and chainId based on the related operations on Signer.
        const rawTxn = await UNISWAP_ROUTER_CONTRACT.populateTransaction.swapExactTokensForETH(valueHex, amountOutMinHex, path, to, deadline, {
            // value: valueHex,
            gasLimit: gasLimit,
            nonce: nonce + 1,
            gasPrice: gasPrice2
        })
        //Returns a Promise which resolves to the transaction.
        let sendTxn = (wallet).sendTransaction(rawTxn)


        //Resolves to the TransactionReceipt once the transaction has been included in the chain for x confirms blocks.
        let reciept = (await sendTxn).wait()
        //Logs the information about the transaction it has been mined.
        if (reciept) {
            console.log(" - Transaction is mined - " + '\n'
                + "Transaction Hash:", (await sendTxn).hash
                + '\n' + "Block Number: "
                + (await reciept).blockNumber + '\n'
                + "Navigate to https://basescan.org/tx/"
            + (await sendTxn).hash, "to see your transaction")
        } else {
            console.log("Error submitting transaction")
        }
        return




    } catch (e) {
        console.error(e)
    }
}


// const token = {
//     chainId: 8453,
//     address: '0x9eC27d9f8B7B35d5131f649D7255af2661c12F00',
//     decimals: 18,
// }
// swapTokensForEth(token, 0.0916311, 500) //first argument = object of token we want to sell, the amount we want to sell, slippage (optional 5%)
// swapEthForTokens(token, .000002, 500) //first argument = token we want, second = amount in ether, slippage(optional 5%)
module.exports = swap;
