import { currency } from './helpers.js';

export const paymentMethodLabels = {
  cash_on_delivery: 'Cash on Delivery',
  gcash: 'GCash (Paid · Demo Simulation)',
  maya: 'Maya (Paid · Demo Simulation)',
};

export const paymentSubmitLabels = {
  cash_on_delivery: 'Place order',
  gcash: 'Proceed to GCash (Demo)',
  maya: 'Proceed to Maya (Demo)',
};

const PROVIDERS = {
  gcash: {
    name: 'GCash',
    title: 'GCash Express Checkout',
    tagline: 'Simulated mobile wallet payment · No real money is charged',
    headerStyle:
      'background: linear-gradient(135deg, #0057ff 0%, #007dfe 100%); color: #ffffff;',
    buttonStyle:
      'background: #0057ff; color: #ffffff; border-radius: 9999px; padding: 0.75rem 1.25rem; font-weight: 600; width: 100%;',
    prefix: 'GC',
  },
  maya: {
    name: 'Maya',
    title: 'Maya Checkout',
    tagline: 'Simulated digital wallet payment · No real money is charged',
    headerStyle:
      'background: linear-gradient(135deg, #0f172a 0%, #059669 100%); color: #ffffff;',
    buttonStyle:
      'background: #059669; color: #ffffff; border-radius: 9999px; padding: 0.75rem 1.25rem; font-weight: 600; width: 100%;',
    prefix: 'MY',
  },
};

function makeElement(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

export function simulateCashlessPayment({ method, amount, phone = '' }) {
  const provider = PROVIDERS[method];
  if (!provider) return Promise.resolve({ approved: true });

  return new Promise((resolve) => {
    const dialog = makeElement(
      'dialog',
      'm-auto w-[min(100%-1.5rem,28rem)] overflow-hidden rounded-[1.75rem] border border-border bg-surface p-0 text-text shadow-high backdrop:bg-black/60',
    );
    dialog.setAttribute('aria-label', `${provider.title} Demo Simulation`);

    const header = makeElement('div', 'p-6');
    header.style.cssText = provider.headerStyle;

    const topRow = makeElement('div', 'flex items-center justify-between gap-3');
    const badge = makeElement(
      'span',
      'inline-block rounded-full bg-white/20 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.14em]',
      'Demo Simulation',
    );
    const closeBtn = makeElement(
      'button',
      'rounded-full bg-white/15 px-3 py-1 text-xs font-semibold hover:bg-white/25',
      'Cancel',
    );
    closeBtn.type = 'button';
    topRow.append(badge, closeBtn);

    const title = makeElement(
      'h2',
      'mt-3 font-display text-2xl font-bold',
      provider.title,
    );
    const subtitle = makeElement('p', 'mt-1 text-xs opacity-90', provider.tagline);

    const summaryBox = makeElement(
      'div',
      'mt-4 flex items-center justify-between rounded-2xl bg-black/20 px-4 py-3 text-sm',
    );
    const merchantLabel = makeElement('span', 'opacity-90', 'Merchant: Floréa Haven');
    const amountLabel = makeElement('strong', 'text-lg font-bold', currency(amount));
    summaryBox.append(merchantLabel, amountLabel);

    header.append(topRow, title, subtitle, summaryBox);

    const body = makeElement('div', 'p-6 space-y-4');
    const stepIndicator = makeElement(
      'p',
      'text-xs font-bold uppercase tracking-[0.12em] text-clay',
      'Step 1 of 3 · Wallet Login',
    );
    const errorBox = makeElement('p', 'form-alert text-xs', '');
    errorBox.hidden = true;
    errorBox.setAttribute('role', 'alert');

    // Step 1: Mobile & MPIN
    const step1 = makeElement('div', 'space-y-4');
    const phoneField = makeElement('div', 'form-field');
    const phoneLabel = makeElement('label', '', `${provider.name} mobile number`);
    phoneLabel.htmlFor = 'sim-wallet-phone';
    const phoneInput = makeElement('input', 'form-input');
    phoneInput.id = 'sim-wallet-phone';
    phoneInput.type = 'tel';
    phoneInput.value = phone.trim() || '0917 123 4567';
    phoneInput.placeholder = '09XX XXX XXXX';
    phoneField.append(phoneLabel, phoneInput);

    const mpinField = makeElement('div', 'form-field');
    const mpinLabel = makeElement('label', '', '4-digit MPIN (Demo)');
    mpinLabel.htmlFor = 'sim-wallet-mpin';
    const mpinInput = makeElement('input', 'form-input tracking-[0.35em]');
    mpinInput.id = 'sim-wallet-mpin';
    mpinInput.type = 'password';
    mpinInput.maxLength = 4;
    mpinInput.value = '1234';
    const mpinHint = makeElement(
      'span',
      'form-hint',
      'Demo mode: pre-filled with 1234. Any 4 digits work.',
    );
    mpinField.append(mpinLabel, mpinInput, mpinHint);

    const step1Next = makeElement('button', '', `Log in to ${provider.name}`);
    step1Next.type = 'button';
    step1Next.style.cssText = provider.buttonStyle;
    step1.append(phoneField, mpinField, step1Next);

    // Step 2: OTP Verification
    const step2 = makeElement('div', 'space-y-4');
    step2.hidden = true;
    let currentOtp = '482910';
    const smsBanner = makeElement(
      'div',
      'rounded-xl border border-border bg-surface-muted p-3 text-xs leading-5 text-text',
      `[Demo SMS] Your ${provider.name} one-time verification code for Floréa Haven is ${currentOtp}.`,
    );
    const otpField = makeElement('div', 'form-field');
    const otpLabel = makeElement('label', '', '6-digit Authentication Code');
    otpLabel.htmlFor = 'sim-wallet-otp';
    const otpInput = makeElement('input', 'form-input tracking-[0.3em] font-semibold');
    otpInput.id = 'sim-wallet-otp';
    otpInput.maxLength = 6;
    otpInput.value = currentOtp;
    const resendBtn = makeElement(
      'button',
      'text-link mt-1 text-xs',
      'Send a new simulated OTP code',
    );
    resendBtn.type = 'button';
    otpField.append(otpLabel, otpInput, resendBtn);

    const step2Actions = makeElement('div', 'grid gap-2');
    const step2Next = makeElement('button', '', 'Verify code');
    step2Next.type = 'button';
    step2Next.style.cssText = provider.buttonStyle;
    const step2Back = makeElement(
      'button',
      'button-quiet w-full text-xs',
      'Back to login',
    );
    step2Back.type = 'button';
    step2Actions.append(step2Next, step2Back);
    step2.append(smsBanner, otpField, step2Actions);

    // Step 3: Confirm & Receipt
    const step3 = makeElement('div', 'space-y-4');
    step3.hidden = true;
    const balanceCard = makeElement(
      'div',
      'rounded-xl border border-border bg-surface-muted p-4 text-sm space-y-2',
    );
    const rowWallet = makeElement('div', 'flex justify-between gap-2');
    rowWallet.append(
      makeElement('span', 'text-text-muted', `${provider.name} Demo Balance`),
      makeElement('strong', 'text-text', currency(25000)),
    );
    const rowAccount = makeElement('div', 'flex justify-between gap-2');
    const accountNumberText = makeElement(
      'span',
      'font-medium text-text',
      phoneInput.value,
    );
    rowAccount.append(
      makeElement('span', 'text-text-muted', 'Mobile Account'),
      accountNumberText,
    );
    const rowTotal = makeElement(
      'div',
      'flex justify-between gap-2 border-t border-border pt-2',
    );
    rowTotal.append(
      makeElement('span', 'font-semibold text-text', 'Total to pay'),
      makeElement('strong', 'text-floral-pink', currency(amount)),
    );
    balanceCard.append(rowWallet, rowAccount, rowTotal);

    const step3Actions = makeElement('div', 'grid gap-2');
    const payBtn = makeElement('button', '', `Confirm & Pay ${currency(amount)}`);
    payBtn.type = 'button';
    payBtn.style.cssText = provider.buttonStyle;
    const step3Back = makeElement('button', 'button-quiet w-full text-xs', 'Back');
    step3Back.type = 'button';
    step3Actions.append(payBtn, step3Back);
    step3.append(balanceCard, step3Actions);

    // Step 4: Approved Receipt
    const step4 = makeElement('div', 'space-y-4 text-center py-2');
    step4.hidden = true;
    const successBadge = makeElement(
      'div',
      'mx-auto grid size-12 place-items-center rounded-full bg-sage text-floral-pink font-bold text-xl',
      '✓',
    );
    const successTitle = makeElement(
      'h3',
      'font-display text-2xl text-floral-pink',
      `${provider.name} Payment Approved`,
    );
    const refNumber = `${provider.prefix}-${Date.now().toString().slice(-8)}`;
    const refText = makeElement(
      'p',
      'text-xs text-text-muted',
      `Simulated Reference No. ${refNumber}`,
    );
    const doneBtn = makeElement('button', '', 'Complete order');
    doneBtn.type = 'button';
    doneBtn.style.cssText = provider.buttonStyle;
    step4.append(successBadge, successTitle, refText, doneBtn);

    body.append(stepIndicator, errorBox, step1, step2, step3, step4);
    dialog.append(header, body);
    document.body.append(dialog);

    let finished = false;
    function finish(approved) {
      if (finished) return;
      finished = true;
      dialog.close();
      dialog.remove();
      resolve({ approved, reference: approved ? refNumber : null });
    }

    function setError(message = '') {
      errorBox.textContent = message;
      errorBox.hidden = !message;
    }

    closeBtn.addEventListener('click', () => finish(false));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(false);
    });

    step1Next.addEventListener('click', () => {
      if (phoneInput.value.trim().length < 7) {
        setError('Enter a valid mobile number for the simulation.');
        return;
      }
      if (!/^\d{4}$/.test(mpinInput.value.trim())) {
        setError('Enter a 4-digit MPIN (for example, 1234).');
        return;
      }
      setError('');
      accountNumberText.textContent = phoneInput.value.trim();
      step1.hidden = true;
      step2.hidden = false;
      stepIndicator.textContent = 'Step 2 of 3 · OTP Verification';
      otpInput.focus();
    });

    resendBtn.addEventListener('click', () => {
      currentOtp = String(Math.floor(100000 + Math.random() * 900000));
      smsBanner.textContent = `[Demo SMS] Your new ${provider.name} verification code for Floréa Haven is ${currentOtp}.`;
      otpInput.value = currentOtp;
      setError('');
    });

    step2Back.addEventListener('click', () => {
      setError('');
      step2.hidden = true;
      step1.hidden = false;
      stepIndicator.textContent = 'Step 1 of 3 · Wallet Login';
    });

    step2Next.addEventListener('click', () => {
      if (!/^\d{6}$/.test(otpInput.value.trim())) {
        setError('Enter the 6-digit OTP code shown above.');
        return;
      }
      setError('');
      step2.hidden = true;
      step3.hidden = false;
      stepIndicator.textContent = 'Step 3 of 3 · Confirm Payment';
      payBtn.focus();
    });

    step3Back.addEventListener('click', () => {
      setError('');
      step3.hidden = true;
      step2.hidden = false;
      stepIndicator.textContent = 'Step 2 of 3 · OTP Verification';
    });

    payBtn.addEventListener('click', () => {
      payBtn.disabled = true;
      step3Back.disabled = true;
      closeBtn.hidden = true;
      payBtn.textContent = `Processing ${provider.name} payment…`;
      setTimeout(() => {
        step3.hidden = true;
        step4.hidden = false;
        stepIndicator.textContent = 'Payment Confirmed · Redirecting';
        doneBtn.focus();
        setTimeout(() => finish(true), 700);
      }, 500);
    });

    doneBtn.addEventListener('click', () => finish(true));

    dialog.showModal();
    phoneInput.focus();
  });
}
