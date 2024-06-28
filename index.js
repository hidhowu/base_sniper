require('dotenv').config();
const { rawDecode } = require('ethereumjs-abi');
const { Web3 } = require('web3');
const swap = require('./swap');
const getContract = require('./getContract');
const { createClient } = require('@supabase/supabase-js');
const checkLiq = require('./liquidity');


const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.PUBLIC_SUPABASE_API_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const rpc_url = process.env.RPC_URL;
const web3 = new Web3(rpc_url);

const stableArr = ['0x4200000000000000000000000000000000000006'];
const base_uniswap = '0x8909dc15e40173ff4699343b6eb8132c65e18ec6';
const wallet_address = process.env.WALLET_ADDRESS;
// let last_block;
const offset = 10000;
// let new_latest_block;
const tokenContracts = []


// Alchemy Metadata extractor section
const { Network, Alchemy } = require("alchemy-sdk");

const settings = {
    apiKey: "tfWRuH15fsRSByrDgjUf1mp5s70eV4v7", // Replace with your Alchemy API Key.
    network: Network.BASE_MAINNET, // Replace with your network.
};
const alchemy = new Alchemy(settings);


// Define a function to fetch token metadata and return the result
async function getTokenMetadata(token) {
    try {
        const tokenMetadata = await alchemy.core.getTokenMetadata(token);
        return tokenMetadata.decimals;
    } catch (error) {
        console.error("Error fetching token metadata:", error);
        throw error; // Re-throw the error to be caught by the caller
    }
}



async function storeToken(token_address, decimals, balance) {
    const newBal = balance * 0.95;
    try {
        const { error } = await supabase.from('token').insert([{ token_address: token_address, decimals: decimals, balance: newBal }]);
        if (error) throw error;
        console.log('token Purchased');

    } catch (error) {
        console.log('token_algo Storage Failed', error);

    }
}

function sleep(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(() => {
            console.log('sleeping');
            resolve();
        }, milliseconds);
    });
}


async function fetchBalance(contract, address) {
    await sleep(2000);
    // fetching token balance using basescan api
    const apiUrl = `https://api.basescan.org/api?module=account&action=tokenbalance&contractaddress=${contract}&address=${address}&tag=latest&apikey=YourApiKeyToken`;

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();

        // Extract the input data
        const balance = data.result;
        return balance;

    } catch (error) {
        console.error('Error fetching data:', error);
        // throw error; 
    }
}


async function fetchPool(base_uniswap, last_block, offset) {
    // const parameter = token_address;
    const apiUrl = `https://api.basescan.org/api?module=account&action=txlistinternal&address=${base_uniswap}&startblock=${last_block}&endblock=10000000000000&page=1&offset=${offset}&sort=asc&apikey=YourApiKeyToken`;

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        // Handle the data here
        // @ts-ignore
        return data;
    } catch (error) {
        console.error('Error fetching data:', error);
        throw error; // Re-throw the error to handle it outside the function if needed
    }
}

async function fetchInfo(contract) {

    // Using go plus labs to fetch token security info
    const apiUrl = `https://api.gopluslabs.io/api/v1/token_security/8453?contract_addresses=${contract}`;

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        // @ts-ignore
        return data;
    } catch (error) {
        console.error('Error fetching data:', error);
        // throw error; 
    }
}

let eligible = 0;


async function getNewPool() {
    try {
        let last_block = 0;
        const poolHash = [];

        // fetch last block
        try {

            const { data, error } = await supabase.from('misc').select('*').eq('id', 1);
            last_block = Number(data[0].last_block);
        } catch (e) {
            console.log(e);
        }
        const dbBlock = last_block

        const result = await fetchPool(base_uniswap, last_block, offset);
        const resultData = result.result
        let poolData
        if (resultData.length > 1) {

            poolData = resultData;
        } else {
            poolData = [...resultData]
        }

        poolData.forEach(el => {
            try {
                // sorting block
                const newBlock = Number(el.blockNumber);
                if (newBlock > last_block && newBlock !== null && Number.isFinite(newBlock)) last_block = newBlock;

                // Adding hash to array
                poolHash.push(el.hash);
            } catch (error) {
                console.log(error);
            }
        })

        for (const el of poolHash) {
            try {


                // Getting token contract from pool hash
                const data = await getContract(el);
                if (!data) continue;
                const contract = data.toLowerCase();

                const options = { method: 'GET', headers: { accept: '*/*' } };

                // getting token information
                const tokenInfo = await fetchInfo(contract, options);
                const tokenData = tokenInfo.result[contract];
                if (!tokenData) continue;


                if (Object.keys(tokenInfo.result).length === 0 || tokenData.is_open_source == '0') continue

                if (tokenData.is_proxy == '1' || tokenData.can_take_back_ownership == '1' || tokenData.hidden_owner == '1' || tokenData.buy_tax > 0.1 || tokenData.sell_tax > 0.1 || tokenData.cannot_buy == 1 || tokenData.cannot_sell_all == 1 || tokenData.is_honeypot == 1 || tokenData.trading_cooldown == 1) continue

                // checking token owershwip to see if ownership is revoked 
                if (!(tokenData.owner_address == '0x0000000000000000000000000000000000000000' || tokenData.owner_address == '0x000000000000000000000000000000000000dead' || tokenData.owner_address == '')) continue
                eligible = eligible + 1;

                const liquidity = await checkLiq(el);
                if (!Number.isFinite(liquidity)) continue
                console.log("Token Address After:", contract, 'Liquidity:', liquidity + 'Eth');

                if ((liquidity < 0.08 && liquidity > 0.0000001) || (liquidity > 0.15 && liquidity < 10000)) continue
                const decimals = await getTokenMetadata(contract)

                const token = {
                    chainId: 8453,
                    address: contract,
                    decimals: decimals
                }

                // Buying token using the swap function
                const txhash = await swap(token, 0.000014, 500, 'in');
                console.log(txhash);
                if (!txhash) continue
                await sleep(1500);
                const balance = await fetchBalance(contract, wallet_address);
                const decimalBalance = balance / 10 ** decimals;

                // store token in db
                await storeToken(contract, decimals, decimalBalance);

            } catch (error) {

                console.log("Error Occured while processing token:", error);
            }

        }

        // store last block
        try {
            if (dbBlock != last_block) {

                if (typeof (last_block) != 'number') console.log('last_block has issues');
                const newestBlock = last_block + 1;

                const { error } = await supabase.from('misc').update({ last_block: newestBlock }).eq('id', 1);
                if (error) throw error;
                console.log('Block Updated');
                last_block = 0;
            }

        } catch (error) {
            console.log('Block Updating Failed', error);

        }

        setTimeout(getNewPool, 5000);
    } catch (error) {
        console.log(error);
    }
}
getNewPool();




