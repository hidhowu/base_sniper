The uniswap base sniper program uses node js to track new token on the base chain and then checks the security of the token to verify if token ownership has been revoked and liquidity has been locked beefore proceeding to purchase such tokens
the program automates the buying and selling of the token

APi Used
Supabase - for storage 
Dexscreener Api - to track token trading data 
Basescan api -  to get token balances 
Goplus Sec Api - To track the security data of token

How it works
The programs tracks the Uniswap base contract deployer for new deployment and then gets the contract of such token form the transaction hash 
It uses the go plus labs api to check the security information of token
if token is secure it proceeds to puchase such token using the uniswap v2 swap library
token tracking commences using the checker program and it checks if profit range is reached and sells the token using the swap program