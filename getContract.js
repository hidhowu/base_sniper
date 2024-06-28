const { Web3 } = require('web3');
const web3 = new Web3('https://base-mainnet.g.alchemy.com/v2/tfWRuH15fsRSByrDgjUf1mp5s70eV4v7');


const abi = [
    {
        type: 'address',
        name: 'Address1',
        indexed: true
    }, {
        type: 'address',
        name: 'Address2',
        indexed: true
    }];


async function getContract(hash) {
    let contract;
    try {
        const receipt = await web3.eth.getTransactionReceipt(hash);

        const logs = receipt.logs;
        logs.forEach(txLog => {

            const topics = txLog.topics;
            const data = txLog.data;
            if (topics.includes('0x0000000000000000000000004200000000000000000000000000000000000006')) {

                const decodedData = web3.eth.abi.decodeLog(abi, data, topics)
                if (decodedData.__length__ == 2) {

                    const pair = [decodedData.Address1, decodedData.Address2]
                    const ethIndex = pair.indexOf('0x4200000000000000000000000000000000000006');

                    const tokenIndex = ethIndex == 0 ? 1 : 0;
                    contract = pair[tokenIndex];
                    return;
                }
            }


        })

        return contract
    } catch (error) {
        console.error("Error:", error);
        // throw error; // Re-throw the error to handle it outside the function if needed
    }
}
// decodeLog(txnHash);

module.exports = getContract;





