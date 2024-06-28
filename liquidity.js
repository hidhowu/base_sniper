require('dotenv').config();
const { Web3 } = require('web3');
const rpc_url = process.env.RPC_URL;

const web3 = new Web3(rpc_url);


const abi = [
    {
        type: 'uint256',
        name: 'Amount0',
    }, {
        type: 'uint256',
        name: 'Amount1',
    }];

const abi2 = [
    {
        type: 'address',
        name: 'pair1',
        indexed: true
    }, {
        type: 'address',
        name: 'pair2',
        indexed: true
    }];



    // Checking and exxtracting token data from  on chain logs 
async function checkLiq(hash) {
    try {
        const receipt = await web3.eth.getTransactionReceipt(hash);
        let index;
        index = receipt.logs.length - 1;
        const txLog = receipt.logs[index]; // Accessing the log at the specified index

        const topics = txLog.topics;
        const data = txLog.data;

        const decodedData = web3.eth.abi.decodeLog(abi, data, topics)
        // console.log(decodedData);

        const txLog2 = receipt.logs[0];
        const topics2 = txLog2.topics;
        const data2 = txLog2.data;

        // console.log(topics2);
        const decodedAddress = web3.eth.abi.decodeLog(abi2, data2, topics2);
        const pair = [decodedAddress[0], decodedAddress[1]];
        // console.log(pair);
        const ethIndex = pair.indexOf('0x4200000000000000000000000000000000000006');//eth


        const ethValue = Number.parseInt(`${decodedData[ethIndex]}`.replace('n', ''));


        console.log("Ethereum Value:", ethValue / 10 ** 18);
        return ethValue / 10 ** 18;
    } catch (error) {
        console.error("Error:", error);
        // throw error; // Re-throw the error to handle it outside the function if needed
    }
}
module.exports = checkLiq;




