(() => {
  "use strict";

  const occupancyPresets = {
    normal: {
      percent: 42, occupied: 30, free: 42, wait: 4,
      label: "Hay espacio disponible",
      title: "Puedes venir sin hacer una fila larga",
      detail: "30 de 72 asientos están ocupados. Tiempo estimado de espera: 4 min.",
      className: "status-available",
      reserveLabel: "Reservar lugar"
    },
    high: {
      percent: 83, occupied: 60, free: 12, wait: 14,
      label: "Quedan pocos lugares",
      title: "Conviene reservar antes de bajar",
      detail: "60 de 72 asientos están ocupados. Tiempo estimado de espera: 14 min.",
      className: "status-high",
      reserveLabel: "Reservar uno de los últimos lugares"
    },
    full: {
      percent: 100, occupied: 72, free: 0, wait: 25,
      label: "Cafetería llena",
      title: "No hay asientos disponibles ahora",
      detail: "Los 72 asientos están ocupados. Puedes reservar otro horario o ver opciones cercanas.",
      className: "status-full",
      reserveLabel: "Reservar otro horario"
    }
  };

  const orderStages = ["received", "preparing", "ready"];
  const orderMessages = {
    received: "Recibimos tu pedido. Te avisaremos cuando empiece la preparación.",
    preparing: "Tu comida está en preparación. Falta muy poco.",
    ready: "¡Tu pedido está listo! Acércate y muestra tu QR."
  };

  let currentOccupancy = "normal";
  let cart = new Map();
  let currentOrder = null;
  let lastTrigger = null;
  let toastTimer = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const elements = {
    ring: $("#occupancy-ring"),
    percent: $("#occupancy-percent"),
    freeSeats: $("#free-seats"),
    waitTime: $("#wait-time"),
    badge: $("#availability-badge"),
    label: $("#availability-label"),
    title: $("#availability-title"),
    detail: $("#availability-detail"),
    reserveButton: $("#reserve-button"),
    alternatives: $("#alternatives"),
    emptyOrder: $("#empty-order"),
    activeOrder: $("#active-order"),
    orderNumber: $("#order-number"),
    pickupEstimate: $("#pickup-estimate"),
    orderMessage: $("#order-message"),
    demoPanel: $("#demo-panel"),
    cartDrawer: $("#cart-drawer"),
    scrim: $("#scrim"),
    cartCount: $("#cart-count"),
    cartEmpty: $("#cart-empty"),
    cartContent: $("#cart-content"),
    cartItems: $("#cart-items"),
    cartTotal: $("#cart-total"),
    toast: $("#toast"),
    reservationDialog: $("#reservation-dialog"),
    successDialog: $("#success-dialog"),
    successEyebrow: $("#success-eyebrow"),
    successTitle: $("#success-title"),
    successMessage: $("#success-message"),
    successCode: $("#success-code"),
    successTime: $("#success-time"),
    qrGrid: $("#qr-grid")
  };

  function announce(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2600);
  }

  function setOccupancy(key, shouldAnnounce = true) {
    const preset = occupancyPresets[key];
    if (!preset) return;
    currentOccupancy = key;
    elements.ring.style.setProperty("--occupancy", preset.percent);
    elements.ring.setAttribute("aria-label", `${preset.percent} por ciento de ocupación`);
    elements.percent.textContent = `${preset.percent}%`;
    elements.freeSeats.textContent = preset.free === 0 ? "Sin lugares libres" : `${preset.free} lugares libres`;
    elements.waitTime.textContent = `${preset.wait} min`;
    elements.label.textContent = preset.label;
    elements.title.textContent = preset.title;
    elements.detail.textContent = preset.detail;
    elements.reserveButton.lastChild.textContent = ` ${preset.reserveLabel}`;
    elements.badge.className = `status-badge ${preset.className}`;
    elements.alternatives.hidden = key !== "full";
    $$("[data-occupancy]").forEach(button => button.classList.toggle("active", button.dataset.occupancy === key));
    if (shouldAnnounce) announce(`Aforo cambiado: ${preset.label}`);
  }

  function setDrawer(drawer, open, trigger = null) {
    const other = drawer === elements.demoPanel ? elements.cartDrawer : elements.demoPanel;
    other.classList.remove("open");
    other.setAttribute("aria-hidden", "true");
    drawer.classList.toggle("open", open);
    drawer.setAttribute("aria-hidden", String(!open));
    elements.scrim.hidden = !open;
    document.body.style.overflow = open ? "hidden" : "";
    $("#demo-trigger").setAttribute("aria-expanded", String(open && drawer === elements.demoPanel));
    $("#cart-button").setAttribute("aria-expanded", String(open && drawer === elements.cartDrawer));
    if (open) {
      lastTrigger = trigger;
      setTimeout(() => $("button, input, select", drawer)?.focus(), 80);
    } else if (lastTrigger) {
      lastTrigger.focus();
      lastTrigger = null;
    }
  }

  function closeDrawers() {
    elements.demoPanel.classList.remove("open");
    elements.cartDrawer.classList.remove("open");
    elements.demoPanel.setAttribute("aria-hidden", "true");
    elements.cartDrawer.setAttribute("aria-hidden", "true");
    elements.scrim.hidden = true;
    document.body.style.overflow = "";
    $("#demo-trigger").setAttribute("aria-expanded", "false");
    $("#cart-button").setAttribute("aria-expanded", "false");
  }

  function updateCart() {
    const entries = [...cart.values()];
    const count = entries.reduce((sum, item) => sum + item.quantity, 0);
    const total = entries.reduce((sum, item) => sum + item.price * item.quantity, 0);
    elements.cartCount.textContent = count;
    elements.cartCount.setAttribute("aria-label", `${count} producto${count === 1 ? "" : "s"}`);
    elements.cartEmpty.hidden = count > 0;
    elements.cartContent.hidden = count === 0;
    elements.cartTotal.textContent = `Bs ${total}`;
    elements.cartItems.innerHTML = "";

    entries.forEach(item => {
      const row = document.createElement("div");
      row.className = "cart-item";
      row.innerHTML = `
        <div><strong>${item.name}</strong><small>Bs ${item.price * item.quantity}</small></div>
        <div class="quantity-control" aria-label="Cantidad de ${item.name}">
          <button type="button" data-cart-action="decrease" data-item="${item.name}" aria-label="Quitar uno">−</button>
          <span>${item.quantity}</span>
          <button type="button" data-cart-action="increase" data-item="${item.name}" aria-label="Agregar uno">+</button>
        </div>
        <button class="remove-item" type="button" data-cart-action="remove" data-item="${item.name}" aria-label="Eliminar ${item.name}">×</button>`;
      elements.cartItems.append(row);
    });

    $$(".add-button").forEach(button => {
      const inCart = cart.has(button.dataset.name);
      button.classList.toggle("added", inCart);
      button.textContent = inCart ? "Agregado ✓" : "Agregar";
    });
  }

  function addToCart(name, price, button) {
    const existing = cart.get(name);
    cart.set(name, { name, price: Number(price), quantity: existing ? existing.quantity + 1 : 1 });
    updateCart();
    announce(`${name} agregado a tu pedido`);
    button.classList.add("added");
  }

  function updateCartQuantity(name, action) {
    const item = cart.get(name);
    if (!item) return;
    if (action === "increase") item.quantity += 1;
    if (action === "decrease") item.quantity -= 1;
    if (action === "remove" || item.quantity <= 0) cart.delete(name);
    updateCart();
  }

  function createCode(seed = Date.now()) {
    return `BRK-${String(seed).slice(-3).padStart(3, "0")}`;
  }

  function ensureDemoOrder(status = "received") {
    if (!currentOrder) {
      currentOrder = {
        code: "BRK-204",
        time: "12:40",
        status,
        items: [{ name: "Almuerzo del día", price: 14, quantity: 1 }],
        total: 14
      };
    }
    setOrderStatus(status);
  }

  function setOrderStatus(status) {
    if (!orderStages.includes(status)) return;
    if (!currentOrder) return ensureDemoOrder(status);
    currentOrder.status = status;
    elements.emptyOrder.hidden = true;
    elements.activeOrder.hidden = false;
    elements.orderNumber.hidden = false;
    elements.orderNumber.textContent = currentOrder.code;
    elements.pickupEstimate.textContent = currentOrder.time;
    elements.orderMessage.textContent = orderMessages[status];
    const currentIndex = orderStages.indexOf(status);
    $$(".progress-step").forEach((step, index) => {
      step.classList.toggle("complete", index < currentIndex || (status === "ready" && index === currentIndex));
      step.classList.toggle("current", index === currentIndex && status !== "ready");
    });
    $$("[data-order-status]").forEach(button => button.classList.toggle("active", button.dataset.orderStatus === status));
    announce(`Pedido ${currentOrder.code}: ${orderMessages[status]}`);
  }

  function buildQr(code) {
    elements.qrGrid.innerHTML = "";
    let seed = [...code].reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const isFinder = (row, col, startRow, startCol) => {
      const r = row - startRow, c = col - startCol;
      if (r < 0 || c < 0 || r > 4 || c > 4) return false;
      return r === 0 || c === 0 || r === 4 || c === 4 || (r >= 2 && r <= 2 && c >= 2 && c <= 2);
    };
    for (let row = 0; row < 15; row += 1) {
      for (let col = 0; col < 15; col += 1) {
        const square = document.createElement("span");
        const finder = isFinder(row, col, 0, 0) || isFinder(row, col, 0, 10) || isFinder(row, col, 10, 0);
        seed = (seed * 9301 + 49297) % 233280;
        if (finder || seed / 233280 > .53) square.className = "dark";
        elements.qrGrid.append(square);
      }
    }
  }

  function showSuccess({ type, code, time, message }) {
    elements.successEyebrow.textContent = type === "reservation" ? "Reserva confirmada" : "Pedido confirmado";
    elements.successTitle.textContent = type === "reservation" ? "¡Tu lugar quedó reservado!" : "¡Listo! Ya no tienes que hacer fila";
    elements.successMessage.textContent = message;
    elements.successCode.textContent = code;
    elements.successTime.textContent = type === "reservation" ? `Reserva: ${time}` : `Recojo: ${time}`;
    $("#go-to-order").hidden = type === "reservation";
    buildQr(code);
    elements.successDialog.showModal();
  }

  function showCurrentQr() {
    if (!currentOrder) return;
    showSuccess({
      type: "order",
      code: currentOrder.code,
      time: currentOrder.time,
      message: currentOrder.status === "ready" ? "Tu pedido está listo para recoger." : "Guarda este código para recoger tu pedido."
    });
  }

  function resetDemo() {
    cart = new Map();
    currentOrder = null;
    updateCart();
    elements.emptyOrder.hidden = false;
    elements.activeOrder.hidden = true;
    elements.orderNumber.hidden = true;
    $$(".progress-step").forEach(step => step.classList.remove("complete", "current"));
    $$("[data-order-status]").forEach(button => button.classList.remove("active"));
    $("#checkout-form").reset();
    $("#reservation-form").reset();
    setOccupancy("normal", false);
    closeDrawers();
    announce("Demostración reiniciada");
  }

  $("#demo-trigger").addEventListener("click", event => setDrawer(elements.demoPanel, true, event.currentTarget));
  $("#mobile-demo-trigger").addEventListener("click", event => setDrawer(elements.demoPanel, true, event.currentTarget));
  $("#close-demo").addEventListener("click", () => setDrawer(elements.demoPanel, false));
  $("#cart-button").addEventListener("click", event => setDrawer(elements.cartDrawer, true, event.currentTarget));
  $("#close-cart").addEventListener("click", () => setDrawer(elements.cartDrawer, false));
  elements.scrim.addEventListener("click", closeDrawers);
  $("#reset-demo").addEventListener("click", resetDemo);

  $$("[data-occupancy]").forEach(button => button.addEventListener("click", () => setOccupancy(button.dataset.occupancy)));
  $$("[data-order-status]").forEach(button => button.addEventListener("click", () => setOrderStatus(button.dataset.orderStatus)));
  $$(".add-button").forEach(button => button.addEventListener("click", () => addToCart(button.dataset.name, button.dataset.price, button)));
  elements.cartItems.addEventListener("click", event => {
    const button = event.target.closest("[data-cart-action]");
    if (button) updateCartQuantity(button.dataset.item, button.dataset.cartAction);
  });

  elements.reserveButton.addEventListener("click", () => {
    closeDrawers();
    elements.reservationDialog.showModal();
  });

  $("#reservation-form").addEventListener("submit", event => {
    const submitter = event.submitter;
    if (submitter?.value === "cancel") return;
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const code = createCode();
    const time = data.get("reserve-time");
    elements.reservationDialog.close();
    showSuccess({
      type: "reservation",
      code,
      time,
      message: `Te esperamos a las ${time} en la cafetería de planta baja.`
    });
  });

  $("#checkout-form").addEventListener("submit", event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity() || cart.size === 0) return;
    const time = $("#pickup-time").value;
    const items = [...cart.values()];
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    currentOrder = { code: createCode(), time, status: "received", items, total };
    setOrderStatus("received");
    closeDrawers();
    showSuccess({ type: "order", code: currentOrder.code, time, message: "La cafetería recibió tu pedido demostrativo." });
    cart = new Map();
    updateCart();
  });

  $("#show-qr-button").addEventListener("click", showCurrentQr);
  $("#close-success").addEventListener("click", () => elements.successDialog.close());
  $("#go-to-order").addEventListener("click", () => {
    elements.successDialog.close();
    $("#mi-pedido").scrollIntoView({ behavior: "smooth", block: "center" });
  });

  elements.successDialog.addEventListener("click", event => {
    if (event.target === elements.successDialog) elements.successDialog.close();
  });
  elements.reservationDialog.addEventListener("click", event => {
    if (event.target === elements.reservationDialog) elements.reservationDialog.close();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && (elements.demoPanel.classList.contains("open") || elements.cartDrawer.classList.contains("open"))) closeDrawers();
  });

  const sections = ["inicio", "menu", "mi-pedido"];
  const observer = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    const id = visible.target.id;
    $$(".nav-link, .mobile-nav-item[href]").forEach(link => link.classList.toggle("active", link.getAttribute("href") === `#${id}`));
  }, { rootMargin: "-25% 0px -60%", threshold: [0, .2, .5] });
  sections.forEach(id => { const section = document.getElementById(id); if (section) observer.observe(section); });

  setOccupancy("normal", false);
  updateCart();
})();
