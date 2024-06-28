require('dotenv').config();
const swap = require('./swap');
const { createClient } = require('@supabase/supabase-js');


const supabaseUrl = process.env.PUBLIC_SUPABASE_URL
const supabaseKey = process.env.PUBLIC_SUPABASE_API_KEY
const supabase = createClient(supabaseUrl, supabaseKey);


// Checking token using dexscreener api to track percentage change and liquidity volume
async function getDex(token_address) {
    const parameter = token_address;
    const apiUrl = `https://api.dexscreener.com/latest/dex/tokens/${parameter}`;

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        // Handle the data here
        if (data.pairs) {
            const change = data.pairs[0].priceChange.h24;
            const liquidity = data.pairs[0].liquidity.usd;
            const dexdata = {
                change,
                liquidity
            }
            return dexdata;

        }
    } catch (error) {
        console.error('Error fetching data:', error);
        throw error; // Re-throw the error to handle it outside the function if needed
    }
}


async function checkTokens() {
    try {
        const { data, error } = await supabase.from('token').select('*').eq('state', true);
        for (const token of data) {
            try {
                // check dexscreener for pump of rug
                const dexData = await getDex(token.token_address);
                console.log(dexData.change, dexData.liquidity);
                if (dexData.change >= 500 /*this means 500% or more in 24 hrs change in dexscreener*/ && dexData.liquidity >= 50) {
                    // sell token
                    const tokenObj = {
                        chainId: 8453, //Base chanin id is 8453
                        address: token.token_address,
                        decimals: token.decimals
                    }
                    const txhash = await swap(tokenObj, token.balance, 500, 'out');
                    if (txhash) {
                        // delete token
                        try {
                            const { data, error } = await supabase
                                .from('token')
                                .delete()
                                .eq('token_address', token.token_address)

                            if (error) throw error
                            console.log('Token deleted');
                        } catch (error) {
                            console.error(error)
                        }
                    } else {
                        try {
                            const { data, error } = await supabase
                                .from('token')
                                .update({ state: false })
                                .eq('token_address', token.token_address)
                            if (error) throw error
                            // console.log('Tracker Database Updated');
                        } catch (error) {
                            console.error(error)
                        }
                    }

                } else if (dexData.liquidity < 20) {
                    // delete token

                    try {
                        const { data, error } = await supabase
                            .from('token')
                            .delete()
                            .eq('token_address', token.token_address)

                        if (error) throw error
                        console.log('Token deleted');
                    } catch (error) {
                        console.error(error)
                    }

                }
            } catch (error) {

                console.log(error);
            }
        }

    } catch (error) {
        console.log(error);
    }

    setTimeout(checkTokens, 15000);
}
checkTokens();