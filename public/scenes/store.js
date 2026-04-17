export default function register(k, engine) {
  k.scene("store", (data) => {
    // Dim store interior background
    k.add([k.rect(640, 480), k.pos(0, 0), k.color(25, 18, 12), k.opacity(0.95)]);
    // Shelves (brown rects)
    for (let y = 0; y < 3; y++) {
      k.add([k.rect(580, 4), k.pos(30, 120 + y * 90), k.color(100, 60, 25), k.opacity(0.4)]);
    }
    // Counter
    k.add([k.rect(640, 6), k.pos(0, 420), k.color(120, 70, 30), k.opacity(0.5)]);

    const overlay = document.getElementById('html-overlay');
    const content = document.getElementById('overlay-content');
    overlay.classList.add('active');

    const budget = engine.supplies?.money ?? STARTING_MONEY[engine.profession] ?? 80000;
    const quantities = {};
    const itemKeys = Object.keys(STORE_PRICES);
    itemKeys.forEach((key) => { quantities[key] = 0; });

    // Challenge restrictions
    const challenge = engine.activeChallenge;
    const disabledItems = {};
    if (challenge === 'pacifist') disabledItems.ammo = true;
    if (challenge === 'iron_man') disabledItems.medicine = true;
    if (challenge === 'minimalist') disabledItems.spare_parts = true;

    function calcTotal() {
      let total = 0;
      for (const key of itemKeys) {
        total += quantities[key] * STORE_PRICES[key].price_cents;
      }
      return total;
    }

    function formatMoney(cents) {
      return '$' + (cents / 100).toFixed(2);
    }

    function render() {
      const spent = calcTotal();
      const remaining = budget - spent;
      const challengeBanner = challenge && CHALLENGE_INFO[challenge]
        ? `<div style="background:rgba(180,40,40,0.2);border:1px solid #8b4513;padding:0.5rem 0.8rem;margin-bottom:1rem;border-radius:4px;">
            <strong style="color:#cc3333;">Weekly Challenge:</strong>
            <span style="color:#deb887;">${CHALLENGE_INFO[challenge].name}</span>
            <br><span style="font-size:0.85em;opacity:0.8;">${CHALLENGE_INFO[challenge].desc}</span>
          </div>`
        : '';

      const rowStyle = `
        display:flex;align-items:center;justify-content:space-between;
        padding:0.5rem 0.6rem;margin-bottom:0.4rem;
        background:rgba(30,20,10,0.5);border:1px solid #5a3510;border-radius:4px;
      `.replace(/\n/g, '');

      const btnStyle = `
        background:#8b4513;color:#deb887;border:1px solid #a0522d;
        width:28px;height:28px;font-size:1rem;cursor:pointer;
        border-radius:3px;font-family:Georgia,serif;
      `.replace(/\n/g, '');

      const disabledBtnStyle = `
        background:#3a3a3a;color:#666;border:1px solid #555;
        width:28px;height:28px;font-size:1rem;cursor:not-allowed;
        border-radius:3px;font-family:Georgia,serif;
      `.replace(/\n/g, '');

      content.innerHTML = `
        <h1 class="overlay-title">Matt's General Store</h1>
        <p class="overlay-text" style="margin-bottom:0.3rem;">
          Independence, Missouri &mdash; Spring 1848
        </p>
        ${challengeBanner}
        <div style="display:flex;justify-content:space-between;margin-bottom:1rem;padding:0.5rem 0.8rem;background:rgba(40,30,15,0.6);border-radius:4px;">
          <span>Budget: <strong style="color:#d4a030;">${formatMoney(budget)}</strong></span>
          <span>Spent: <strong>${formatMoney(spent)}</strong></span>
          <span>Remaining: <strong style="color:${remaining >= 0 ? '#6aad6a' : '#cc3333'};">${formatMoney(remaining)}</strong></span>
        </div>
        <div id="store-items">
          ${itemKeys.map((key) => {
            const item = STORE_PRICES[key];
            const qty = quantities[key];
            const cost = qty * item.price_cents;
            const disabled = !!disabledItems[key];
            const nameLabel = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            return `
              <div style="${rowStyle}${disabled ? 'opacity:0.4;' : ''}" title="${item.tooltip}">
                <div style="flex:1;min-width:120px;">
                  <strong>${nameLabel}</strong>
                  <br><span style="font-size:0.8em;opacity:0.7;">${item.unit_label} @ ${formatMoney(item.price_cents)}</span>
                </div>
                <div style="display:flex;align-items:center;gap:0.4rem;">
                  <button class="store-minus" data-item="${key}" style="${disabled ? disabledBtnStyle : btnStyle}" ${disabled ? 'disabled' : ''}>-</button>
                  <span class="store-qty" style="min-width:30px;text-align:center;font-weight:bold;">${qty}</span>
                  <button class="store-plus" data-item="${key}" style="${disabled ? disabledBtnStyle : btnStyle}" ${disabled ? 'disabled' : ''}>+</button>
                </div>
                <div style="min-width:70px;text-align:right;">
                  <span class="store-cost">${formatMoney(cost)}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <div style="display:flex;gap:0.8rem;margin-top:1.2rem;flex-wrap:wrap;">
          <button id="store-recommend" class="overlay-choice" style="flex:1;min-width:140px;padding:0.7rem 1rem;">
            Buy Recommended
          </button>
          <button id="store-clear" class="overlay-choice" style="flex:0.5;min-width:100px;padding:0.7rem 1rem;">
            Clear All
          </button>
          <button id="store-buy" class="overlay-choice" style="flex:1;min-width:140px;padding:0.7rem 1rem;background:rgba(80,120,60,0.3);border-color:#6aad6a;">
            Hit the Trail
          </button>
        </div>
        <div id="store-error" style="display:none;color:#cc3333;text-align:center;margin-top:0.8rem;font-size:0.9em;"></div>
      `;

      // Wire minus buttons
      content.querySelectorAll('.store-minus').forEach((btn) => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.item;
          if (disabledItems[key]) return;
          if (quantities[key] > 0) {
            quantities[key]--;
            render();
          }
        });
      });

      // Wire plus buttons
      content.querySelectorAll('.store-plus').forEach((btn) => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.item;
          if (disabledItems[key]) return;
          const newTotal = calcTotal() + STORE_PRICES[key].price_cents;
          if (newTotal <= budget) {
            quantities[key]++;
            render();
          } else {
            const errEl = document.getElementById('store-error');
            errEl.textContent = 'Not enough money!';
            errEl.style.display = 'block';
            setTimeout(() => { errEl.style.display = 'none'; }, 1500);
          }
        });
      });

      // Recommend button
      document.getElementById('store-recommend').addEventListener('click', () => {
        const rec = RECOMMENDED_PURCHASES[engine.profession];
        if (!rec) return;
        for (const key of itemKeys) {
          if (disabledItems[key]) {
            quantities[key] = 0;
          } else {
            quantities[key] = rec[key] || 0;
          }
        }
        // Clamp to budget
        while (calcTotal() > budget) {
          // Remove one of the most expensive item
          let maxKey = null;
          let maxPrice = 0;
          for (const key of itemKeys) {
            if (quantities[key] > 0 && STORE_PRICES[key].price_cents > maxPrice) {
              maxPrice = STORE_PRICES[key].price_cents;
              maxKey = key;
            }
          }
          if (maxKey) quantities[maxKey]--;
          else break;
        }
        render();
      });

      // Clear button
      document.getElementById('store-clear').addEventListener('click', () => {
        itemKeys.forEach((key) => { quantities[key] = 0; });
        render();
      });

      // Buy button
      document.getElementById('store-buy').addEventListener('click', () => {
        if (calcTotal() > budget) {
          const errEl = document.getElementById('store-error');
          errEl.textContent = 'You can\'t afford all that! Remove some items.';
          errEl.style.display = 'block';
          return;
        }
        overlay.classList.remove('active');
        // Build purchases as StoreItem array
        const purchases = [];
        for (const [key, qty] of Object.entries(quantities)) {
          if (qty > 0) purchases.push({ item: key, quantity: qty });
        }
        engine.purchaseSupplies(purchases);
      });
    }

    render();

    // Error recovery
    const onError = ({ message }) => {
      overlay.classList.add('active');
      const errEl = document.getElementById('store-error');
      if (errEl) {
        errEl.textContent = message || 'Something went wrong. Try again.';
        errEl.style.display = 'block';
      }
    };
    engine.on('error', onError);
    k.onSceneLeave(() => engine.off('error', onError));
  });
}
