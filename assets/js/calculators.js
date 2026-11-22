/* MarginProof Client-Side Calculator Engine & Portal Helpers (UMD: Browser + Node tests) */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.MarginProofPortal = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function num(val, fallback) {
    var parsed = Number(val);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
  }

  function formatMoney(amount, currency, decimals) {
    var cur = currency || "EUR";
    var dec = typeof decimals === "number" ? decimals : 0;
    var safe = Number.isFinite(amount) ? amount : 0;
    return (
      safe.toLocaleString("en-US", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      }) +
      " " +
      cur
    );
  }

  function formatPercent(ratio, decimals) {
    var dec = typeof decimals === "number" ? decimals : 1;
    var safe = Number.isFinite(ratio) ? ratio : 0;
    return (safe * 100).toFixed(dec) + "%";
  }

  /**
   * Calculator 1: Freelance Hourly & Day Rate Engine
   * Mirrors P1 MarginProof_Rate_and_Margin_Calculator.xlsx formulas.
   */
  function calculateHourlyAndDayRate(raw) {
    var currency = (raw && raw.currency) || "EUR";
    var targetNet = Math.max(0, num(raw && raw.targetNet, 90000));
    var overhead = Math.max(0, num(raw && raw.overhead, 14400));
    var rawTaxPct = num(raw && raw.taxRate, 32);
    var taxPct = clamp(rawTaxPct, 0, 90);
    var taxRate = taxPct / 100;

    var weeks = Math.max(1, num(raw && raw.weeks, 46));
    var hoursPerWeek = Math.max(1, num(raw && raw.hoursPerWeek, 40));
    var rawUtilPct = num(raw && raw.utilization, 65);
    var utilPct = clamp(rawUtilPct, 5, 100);
    var utilization = utilPct / 100;

    var hoursPerDay = clamp(num(raw && raw.hoursPerDay, 7), 1, 16);
    var profitBufferPct = clamp(num(raw && raw.profitBuffer, 20), 0, 200);
    var profitBuffer = profitBufferPct / 100;
    var subCost = Math.max(0, num(raw && raw.subCost, 48));
    var rawFeePct = num(raw && raw.paymentFee, 3.5);
    var feePct = clamp(rawFeePct, 0, 50);
    var paymentFee = feePct / 100;

    var warnings = [];
    if (rawTaxPct > 90) warnings.push("Tax rate clamped at 90% max to keep net denominator positive.");
    if (rawUtilPct < 5) warnings.push("Billable utilization clamped to at least 5%.");
    if (rawFeePct > 50) warnings.push("Payment fee buffer clamped to 50% max.");

    var totalWorkingHours = weeks * hoursPerWeek;
    var billableHours = totalWorkingHours * utilization;
    var unbilledHours = totalWorkingHours - billableHours;

    var preProfitRevenue = targetNet / (1 - taxRate) + overhead;
    var requiredGrossRevenue = (preProfitRevenue * (1 + profitBuffer)) / (1 - paymentFee);
    var breakEvenHourly = billableHours > 0 ? preProfitRevenue / billableHours : 0;
    var targetHourlyRate = billableHours > 0 ? requiredGrossRevenue / billableHours : 0;
    var recommendedDayRate = targetHourlyRate * hoursPerDay;
    var weeklySprintRate = recommendedDayRate * 5;
    var valueHourlyRate = targetHourlyRate * 1.15;
    var rushHourlyRate = targetHourlyRate * 1.35;
    var monthlyGrossTarget = requiredGrossRevenue / 12;
    var marginVsSub = targetHourlyRate > 0 ? (targetHourlyRate - subCost) / targetHourlyRate : 0;

    return {
      currency: currency,
      totalWorkingHours: totalWorkingHours,
      billableHours: billableHours,
      unbilledHours: unbilledHours,
      preProfitRevenue: preProfitRevenue,
      requiredGrossRevenue: requiredGrossRevenue,
      breakEvenHourly: breakEvenHourly,
      targetHourlyRate: targetHourlyRate,
      recommendedDayRate: recommendedDayRate,
      weeklySprintRate: weeklySprintRate,
      valueHourlyRate: valueHourlyRate,
      valueDayRate: valueHourlyRate * hoursPerDay,
      rushHourlyRate: rushHourlyRate,
      rushDayRate: rushHourlyRate * hoursPerDay,
      monthlyGrossTarget: monthlyGrossTarget,
      marginVsSub: marginVsSub,
      hoursPerDay: hoursPerDay,
      warnings: warnings,
    };
  }

  /**
   * Calculator 2: Scope-Creep & Discount Margin Leak Simulator
   * Mirrors P1 Margin Leak Simulator sensitivity matrix.
   */
  function calculateMarginLeak(raw) {
    var currency = (raw && raw.currency) || "EUR";
    var quotedFee = Math.max(0, num(raw && raw.quotedFee, 10000));
    var estimatedHours = Math.max(1, num(raw && raw.estimatedHours, 80));
    var costPerHour = Math.max(0, num(raw && raw.costPerHour, 55));
    var discountPct = clamp(num(raw && raw.discountPct, 10), 0, 95);
    var creepPct = clamp(num(raw && raw.creepPct, 20), 0, 300);
    var targetHourly = Math.max(1, num(raw && raw.targetHourly, 135));

    var baselineEffectiveRate = quotedFee / estimatedHours;
    var baselineCost = estimatedHours * costPerHour;
    var baselineGrossProfit = quotedFee - baselineCost;
    var baselineMarginPct = quotedFee > 0 ? baselineGrossProfit / quotedFee : 0;

    function runScenario(label, dPct, cPct) {
      var collected = quotedFee * (1 - dPct / 100);
      var actualHours = estimatedHours * (1 + cPct / 100);
      var actualCost = actualHours * costPerHour;
      var effectiveRate = actualHours > 0 ? collected / actualHours : 0;
      var grossProfit = collected - actualCost;
      var grossMarginPct = collected > 0 ? grossProfit / collected : 0;
      var deltaVsTarget = effectiveRate - targetHourly;
      var rateDropPct = baselineEffectiveRate > 0 ? (effectiveRate - baselineEffectiveRate) / baselineEffectiveRate : 0;
      var profitErosion = baselineGrossProfit - grossProfit;
      return {
        label: label,
        discountPct: dPct,
        creepPct: cPct,
        collectedRevenue: collected,
        actualHours: actualHours,
        actualCost: actualCost,
        effectiveRate: effectiveRate,
        grossProfit: grossProfit,
        grossMarginPct: grossMarginPct,
        deltaVsTarget: deltaVsTarget,
        rateDropPct: rateDropPct,
        profitErosion: profitErosion,
      };
    }

    var custom = runScenario("Your Custom Scenario", discountPct, creepPct);
    var presets = [
      runScenario("Disciplined Baseline (0% / +0%)", 0, 0),
      runScenario("Small Concession (-5% / +10% Scope)", 5, 10),
      runScenario("Typical Unmanaged (-10% / +20% Scope)", 10, 20),
      runScenario("Heavy Scope Creep (-15% / +35% Scope)", 15, 35),
      runScenario("Margin Disaster (-20% / +50% Scope)", 20, 50),
    ];

    var marginSignal = "HEALTHY";
    if (custom.grossMarginPct < 0.35 || custom.effectiveRate < costPerHour) {
      marginSignal = "DANGER";
    } else if (custom.grossMarginPct < 0.5 || custom.effectiveRate < targetHourly) {
      marginSignal = "WATCH";
    }

    return {
      currency: currency,
      quotedFee: quotedFee,
      estimatedHours: estimatedHours,
      costPerHour: costPerHour,
      targetHourly: targetHourly,
      baselineEffectiveRate: baselineEffectiveRate,
      baselineGrossProfit: baselineGrossProfit,
      baselineMarginPct: baselineMarginPct,
      custom: custom,
      scenarios: presets,
      marginSignal: marginSignal,
    };
  }

  /**
   * Calculator 3: Client Retainer Profitability Checker
   * Mirrors P1 Client Retainer & Project Profitability OS flags (>105% OVER-SERVICED, >85% WATCH).
   */
  function calculateRetainerProfitability(raw) {
    var currency = (raw && raw.currency) || "EUR";
    var retainerFee = Math.max(0, num(raw && raw.retainerFee, 3500));
    var contractedHours = Math.max(1, num(raw && raw.contractedHours, 25));
    var inScopeHours = Math.max(0, num(raw && raw.inScopeHours, 22));
    var creepHours = Math.max(0, num(raw && raw.creepHours, 8));
    var costPerHour = Math.max(0, num(raw && raw.costPerHour, 55));
    var targetHourly = Math.max(1, num(raw && raw.targetHourly, 135));

    var totalLoggedHours = inScopeHours + creepHours;
    var utilizationPct = totalLoggedHours / contractedHours;
    var deliveryCost = totalLoggedHours * costPerHour;
    var grossProfit = retainerFee - deliveryCost;
    var grossMarginPct = retainerFee > 0 ? grossProfit / retainerFee : 0;
    var contractedRate = retainerFee / contractedHours;
    var realizedRate = totalLoggedHours > 0 ? retainerFee / totalLoggedHours : retainerFee;

    var status = "HEALTHY";
    if (utilizationPct > 1.05) {
      status = "OVER-SERVICED";
    } else if (utilizationPct > 0.85) {
      status = "WATCH";
    }

    var unbilledLeakValue = creepHours * targetHourly;
    var recommendedResetFee = Math.max(retainerFee, totalLoggedHours * targetHourly);
    var monthlyUpsideIfRepriced = recommendedResetFee - retainerFee;

    return {
      currency: currency,
      retainerFee: retainerFee,
      contractedHours: contractedHours,
      inScopeHours: inScopeHours,
      creepHours: creepHours,
      totalLoggedHours: totalLoggedHours,
      utilizationPct: utilizationPct,
      deliveryCost: deliveryCost,
      grossProfit: grossProfit,
      grossMarginPct: grossMarginPct,
      contractedRate: contractedRate,
      realizedRate: realizedRate,
      status: status,
      unbilledLeakValue: unbilledLeakValue,
      recommendedResetFee: recommendedResetFee,
      monthlyUpsideIfRepriced: monthlyUpsideIfRepriced,
    };
  }

  /**
   * Calculator 4: Multi-Currency Tax Reserve & Runway Calculator
   * Mirrors P1 Cashflow, Tax Reserve & Invoice Tracker logic.
   */
  function calculateTaxAndRunway(raw) {
    var baseCurrency = (raw && raw.baseCurrency) || "EUR";
    var fxCurrency = (raw && raw.fxCurrency) || "USD";
    var fxRate = Math.max(0.01, num(raw && raw.fxRate, 0.92));
    var bankBalance = Math.max(0, num(raw && raw.bankBalance, 18500));
    var baseMonthlyRevenue = Math.max(0, num(raw && raw.baseMonthlyRevenue, 6500));
    var fxMonthlyRevenue = Math.max(0, num(raw && raw.fxMonthlyRevenue, 3200));
    var monthlyExpenses = Math.max(0, num(raw && raw.monthlyExpenses, 3200));
    var vatSharePct = clamp(num(raw && raw.vatSharePct, 65), 0, 100);
    var vatRatePct = clamp(num(raw && raw.vatRatePct, 19), 0, 35);
    var incomeTaxPct = clamp(num(raw && raw.incomeTaxPct, 30), 0, 60);
    var monthsAccumulated = clamp(num(raw && raw.monthsAccumulated, 3), 1, 12);
    var openReceivables = Math.max(0, num(raw && raw.openReceivables, 4200));
    var overdueReceivables = Math.max(0, num(raw && raw.overdueReceivables, 1400));

    var convertedFxRevenue = fxMonthlyRevenue * fxRate;
    var totalMonthlyNetRevenue = baseMonthlyRevenue + convertedFxRevenue;
    var monthlyPreTaxProfit = totalMonthlyNetRevenue - monthlyExpenses;
    var monthlyTaxReserve = Math.max(0, monthlyPreTaxProfit * (incomeTaxPct / 100));
    var monthlyVatLiability = totalMonthlyNetRevenue * (vatSharePct / 100) * (vatRatePct / 100);
    var monthlySpendableOwnerNet = monthlyPreTaxProfit - monthlyTaxReserve;

    var reservedTaxVaultTotal = monthlyTaxReserve * monthsAccumulated;
    var reservedVatVaultTotal = monthlyVatLiability * monthsAccumulated;
    var totalStatutoryReserves = reservedTaxVaultTotal + reservedVatVaultTotal;
    var trueSpendableCash = bankBalance - totalStatutoryReserves;

    var runwayMonths = monthlyExpenses > 0 ? Math.max(0, trueSpendableCash) / monthlyExpenses : trueSpendableCash > 0 ? 999 : 0;
    var runwayStatus = "SAFE";
    if (trueSpendableCash <= 0 || runwayMonths < 3) {
      runwayStatus = "CRITICAL";
    } else if (runwayMonths < 6) {
      runwayStatus = "WATCH";
    }

    return {
      baseCurrency: baseCurrency,
      fxCurrency: fxCurrency,
      fxRate: fxRate,
      convertedFxRevenue: convertedFxRevenue,
      totalMonthlyNetRevenue: totalMonthlyNetRevenue,
      monthlyExpenses: monthlyExpenses,
      monthlyPreTaxProfit: monthlyPreTaxProfit,
      monthlyTaxReserve: monthlyTaxReserve,
      monthlyVatLiability: monthlyVatLiability,
      monthlySpendableOwnerNet: monthlySpendableOwnerNet,
      reservedTaxVaultTotal: reservedTaxVaultTotal,
      reservedVatVaultTotal: reservedVatVaultTotal,
      totalStatutoryReserves: totalStatutoryReserves,
      bankBalance: bankBalance,
      trueSpendableCash: trueSpendableCash,
      runwayMonths: runwayMonths,
      runwayStatus: runwayStatus,
      openReceivables: openReceivables,
      overdueReceivables: overdueReceivables,
    };
  }

  /**
   * High-Price /systems/ Margin Recovery ROI Estimator
   */
  function calculateSystemsRoi(raw) {
    var monthlyRevenue = Math.max(1000, num(raw && raw.monthlyRevenue, 40000));
    var leakedMarginPct = clamp(num(raw && raw.leakedMarginPct, 15), 1, 50);
    var recoverySharePct = clamp(num(raw && raw.recoverySharePct, 75), 10, 100);
    var tierPrice = Math.max(1000, num(raw && raw.tierPrice, 3500));

    var monthlyLeak = monthlyRevenue * (leakedMarginPct / 100);
    var monthlyRecovered = monthlyLeak * (recoverySharePct / 100);
    var annualRecovered = monthlyRecovered * 12;
    var paybackMonths = monthlyRecovered > 0 ? tierPrice / monthlyRecovered : 99;
    var paybackDays = Math.round(paybackMonths * 30);
    var firstYearRoiMultiple = tierPrice > 0 ? annualRecovered / tierPrice : 0;

    return {
      monthlyRevenue: monthlyRevenue,
      leakedMarginPct: leakedMarginPct,
      monthlyLeak: monthlyLeak,
      monthlyRecovered: monthlyRecovered,
      annualRecovered: annualRecovered,
      tierPrice: tierPrice,
      paybackMonths: paybackMonths,
      paybackDays: paybackDays,
      firstYearRoiMultiple: firstYearRoiMultiple,
    };
  }

  /* ---------------- Browser DOM Wiring ---------------- */
  function getSiteConfig() {
    if (typeof window !== "undefined" && window.MARGINPROOF_CONFIG) {
      return window.MARGINPROOF_CONFIG;
    }
    return { products: {}, payhip_store_url: "" };
  }

  function bindProductButtons(rootDoc, config) {
    var cfg = config || getSiteConfig();
    var products = cfg.products || {};
    var buttons = rootDoc.querySelectorAll("[data-product-key]");
    buttons.forEach(function (btn) {
      var key = btn.getAttribute("data-product-key");
      var prod = products[key];
      if (!prod) return;
      if (prod.checkout_url && /^https?:\/\//i.test(prod.checkout_url)) {
        btn.setAttribute("href", prod.checkout_url);
        btn.setAttribute("target", "_blank");
        btn.setAttribute("rel", "noopener noreferrer");
        btn.onclick = null;
      } else {
        btn.setAttribute("href", "#product-spec-" + key);
        btn.onclick = function (evt) {
          evt.preventDefault();
          openProductModal(rootDoc, prod, cfg);
        };
      }
    });
  }

  function ensureModal(rootDoc) {
    var existing = rootDoc.getElementById("mp-checkout-modal");
    if (existing) return existing;
    var wrap = rootDoc.createElement("div");
    wrap.id = "mp-checkout-modal";
    wrap.className = "modal-backdrop";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.innerHTML =
      '<div class="modal-box">' +
      '  <div class="modal-head">' +
      '    <div><span class="eyebrow" id="mp-m-channel">Payhip</span><h3 id="mp-m-title" style="margin-top:8px;"></h3></div>' +
      '    <button type="button" class="modal-close" id="mp-m-close">Close</button>' +
      "  </div>" +
      '  <p class="lead" style="font-size:14.5px; margin-bottom:10px;" id="mp-m-desc"></p>' +
      '  <div class="card-subtle" style="margin-bottom:12px;">' +
      '    <div style="font-size:12px; color:var(--text-muted); margin-bottom:6px;">INCLUDED DELIVERABLES</div>' +
      '    <ul class="check-list" id="mp-m-list" style="margin:0;"></ul>' +
      "  </div>" +
      '  <div class="alert-banner alert-warn visible" style="margin-bottom:14px;">' +
      '    <strong>Checkout Link Status:</strong> Live checkout URL is not yet configured in <code>config/site_config.json</code>. Once uploaded to Payhip/Stripe, paste the URL into <code>site_config.json</code> or the VeriTakt Cockpit to activate instant 1-click checkout across every calculator page.' +
      "  </div>" +
      '  <div class="btn-row">' +
      '    <button type="button" class="btn btn-primary btn-sm" id="mp-m-ok">Got it</button>' +
      "  </div>" +
      "</div>";
    rootDoc.body.appendChild(wrap);
    function close() {
      wrap.classList.remove("open");
    }
    wrap.querySelector("#mp-m-close").addEventListener("click", close);
    wrap.querySelector("#mp-m-ok").addEventListener("click", close);
    wrap.addEventListener("click", function (e) {
      if (e.target === wrap) close();
    });
    return wrap;
  }

  function openProductModal(rootDoc, prod, cfg) {
    var modal = ensureModal(rootDoc);
    modal.querySelector("#mp-m-channel").textContent = (prod.channel || "Payhip") + " · " + (prod.price_label || "");
    modal.querySelector("#mp-m-title").textContent = prod.name || "MarginProof Kit";
    modal.querySelector("#mp-m-desc").textContent =
      "Product ID: " + (prod.id || "") + " | Suggested Slug: " + (prod.suggested_slug || "") + " | Brand: " + (cfg.footer_branding || "MarginProof · by VeriTakt Collective");
    var ul = modal.querySelector("#mp-m-list");
    ul.innerHTML = "";
    (prod.includes || []).forEach(function (item) {
      var li = rootDoc.createElement("li");
      li.textContent = item;
      ul.appendChild(li);
    });
    modal.classList.add("open");
  }

  function setText(doc, id, text) {
    var el = doc.getElementById(id);
    if (el) el.textContent = text;
  }

  function fallbackCopyText(doc, text) {
    try {
      if (!doc.createElement || !doc.body || !doc.execCommand) return false;
      var ta = doc.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      doc.body.appendChild(ta);
      ta.select();
      var ok = doc.execCommand("copy");
      doc.body.removeChild(ta);
      return Boolean(ok);
    } catch (_err) {
      return false;
    }
  }

  function attachCopyBtn(doc, btnId, summaryFn) {
    var btn = doc.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener("click", function () {
      var txt = summaryFn();
      function showFeedback(ok) {
        var prev = btn.textContent;
        btn.textContent = ok ? "Copied Summary!" : "Copy Failed";
        setTimeout(function () {
          btn.textContent = prev;
        }, 1600);
      }
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(
          function () {
            showFeedback(true);
          },
          function () {
            showFeedback(fallbackCopyText(doc, txt));
          }
        );
      } else {
        showFeedback(fallbackCopyText(doc, txt));
      }
    });
  }

  function readQueryOverrides(doc, inputMap) {
    if (typeof window === "undefined" || !window.location || !window.location.search) return;
    var params = new URLSearchParams(window.location.search);
    Object.keys(inputMap).forEach(function (paramName) {
      if (!params.has(paramName)) return;
      var el = doc.getElementById(inputMap[paramName]);
      if (!el) return;
      var raw = params.get(paramName);
      if (el.tagName === "SELECT") {
        for (var i = 0; i < el.options.length; i++) {
          if (el.options[i].value === raw) {
            el.value = raw;
            break;
          }
        }
      } else if (el.type === "number") {
        var parsed = Number(raw);
        if (raw !== "" && Number.isFinite(parsed)) {
          el.value = String(parsed);
        }
      } else {
        el.value = raw;
      }
    });
  }

  function initHourlyRateCalc(doc) {
    var ids = {
      currency: "hr-currency",
      targetNet: "hr-target-net",
      overhead: "hr-overhead",
      taxRate: "hr-tax",
      weeks: "hr-weeks",
      hoursPerWeek: "hr-hours-week",
      utilization: "hr-util",
      hoursPerDay: "hr-hours-day",
      profitBuffer: "hr-buffer",
      subCost: "hr-sub-cost",
      paymentFee: "hr-fee",
    };
    readQueryOverrides(doc, ids);

    var defaults = {};
    Object.keys(ids).forEach(function (k) {
      var el = doc.getElementById(ids[k]);
      if (el) defaults[k] = el.value;
    });

    function compute() {
      var payload = {};
      Object.keys(ids).forEach(function (k) {
        var el = doc.getElementById(ids[k]);
        payload[k] = el ? el.value : defaults[k];
      });
      var res = calculateHourlyAndDayRate(payload);
      var c = res.currency;

      setText(doc, "out-hr-target", formatMoney(res.targetHourlyRate, c, 0) + "/hr");
      setText(doc, "out-hr-day", formatMoney(res.recommendedDayRate, c, 0) + "/day");
      setText(doc, "out-hr-floor", formatMoney(res.breakEvenHourly, c, 0) + "/hr");
      setText(doc, "out-hr-gross", formatMoney(res.requiredGrossRevenue, c, 0));
      setText(doc, "out-hr-monthly", formatMoney(res.monthlyGrossTarget, c, 0) + "/mo");
      setText(doc, "out-hr-billable", Math.round(res.billableHours).toLocaleString("en-US") + " hrs/yr");
      setText(doc, "out-hr-unbilled", Math.round(res.unbilledHours).toLocaleString("en-US") + " hrs/yr");
      setText(doc, "out-hr-submargin", formatPercent(res.marginVsSub, 1));

      setText(doc, "tier-floor-hr", formatMoney(res.breakEvenHourly, c, 0));
      setText(doc, "tier-floor-day", formatMoney(res.breakEvenHourly * res.hoursPerDay, c, 0));
      setText(doc, "tier-floor-wk", formatMoney(res.breakEvenHourly * res.hoursPerDay * 5, c, 0));

      setText(doc, "tier-std-hr", formatMoney(res.targetHourlyRate, c, 0));
      setText(doc, "tier-std-day", formatMoney(res.recommendedDayRate, c, 0));
      setText(doc, "tier-std-wk", formatMoney(res.weeklySprintRate, c, 0));

      setText(doc, "tier-val-hr", formatMoney(res.valueHourlyRate, c, 0));
      setText(doc, "tier-val-day", formatMoney(res.valueDayRate, c, 0));
      setText(doc, "tier-val-wk", formatMoney(res.valueDayRate * 5, c, 0));

      setText(doc, "tier-rush-hr", formatMoney(res.rushHourlyRate, c, 0));
      setText(doc, "tier-rush-day", formatMoney(res.rushDayRate, c, 0));
      setText(doc, "tier-rush-wk", formatMoney(res.rushDayRate * 5, c, 0));

      var warnEl = doc.getElementById("hr-warnings");
      if (warnEl) {
        if (res.warnings.length) {
          warnEl.textContent = res.warnings.join(" ");
          warnEl.classList.add("visible");
        } else {
          warnEl.classList.remove("visible");
        }
      }

      var meter = doc.getElementById("hr-margin-meter");
      if (meter) {
        var pct = clamp(res.marginVsSub * 100, 0, 100);
        meter.style.width = pct.toFixed(1) + "%";
        meter.style.background = res.marginVsSub >= 0.5 ? "var(--emerald)" : res.marginVsSub >= 0.35 ? "var(--gold)" : "var(--red)";
      }
      return res;
    }

    Object.keys(ids).forEach(function (k) {
      var el = doc.getElementById(ids[k]);
      if (el) {
        el.addEventListener("input", compute);
        el.addEventListener("change", compute);
      }
    });
    var resetBtn = doc.getElementById("hr-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        Object.keys(ids).forEach(function (k) {
          var el = doc.getElementById(ids[k]);
          if (el) el.value = defaults[k];
        });
        compute();
      });
    }
    attachCopyBtn(doc, "hr-copy", function () {
      var r = compute();
      return (
        "MarginProof Rate Card Summary:\n" +
        "- Break-Even Floor: " + formatMoney(r.breakEvenHourly, r.currency, 0) + "/hr\n" +
        "- Target Hourly Rate: " + formatMoney(r.targetHourlyRate, r.currency, 0) + "/hr\n" +
        "- Recommended Day Rate (" + r.hoursPerDay + "h): " + formatMoney(r.recommendedDayRate, r.currency, 0) + "\n" +
        "- Weekly Sprint (5d): " + formatMoney(r.weeklySprintRate, r.currency, 0) + "\n" +
        "- Required Annual Gross Revenue: " + formatMoney(r.requiredGrossRevenue, r.currency, 0)
      );
    });
    compute();
  }

  function initMarginLeakCalc(doc) {
    var ids = {
      currency: "ml-currency",
      quotedFee: "ml-quoted",
      estimatedHours: "ml-hours",
      costPerHour: "ml-cost",
      discountPct: "ml-discount",
      creepPct: "ml-creep",
      targetHourly: "ml-target",
    };
    readQueryOverrides(doc, ids);
    var defaults = {};
    Object.keys(ids).forEach(function (k) {
      var el = doc.getElementById(ids[k]);
      if (el) defaults[k] = el.value;
    });

    function compute() {
      var payload = {};
      Object.keys(ids).forEach(function (k) {
        var el = doc.getElementById(ids[k]);
        payload[k] = el ? el.value : defaults[k];
      });
      var res = calculateMarginLeak(payload);
      var c = res.currency;

      setText(doc, "out-ml-base-rate", formatMoney(res.baselineEffectiveRate, c, 0) + "/hr");
      setText(doc, "out-ml-real-rate", formatMoney(res.custom.effectiveRate, c, 0) + "/hr");
      setText(doc, "out-ml-collected", formatMoney(res.custom.collectedRevenue, c, 0));
      setText(doc, "out-ml-hours", res.custom.actualHours.toFixed(1) + " hrs");
      setText(doc, "out-ml-profit", formatMoney(res.custom.grossProfit, c, 0));
      setText(doc, "out-ml-margin", formatPercent(res.custom.grossMarginPct, 1));
      setText(doc, "out-ml-erosion", "-" + formatMoney(Math.max(0, res.custom.profitErosion), c, 0));
      setText(doc, "out-ml-drop", formatPercent(res.custom.rateDropPct, 1));

      var badge = doc.getElementById("out-ml-badge");
      if (badge) {
        badge.className = "badge " + (res.marginSignal === "HEALTHY" ? "badge-healthy" : res.marginSignal === "WATCH" ? "badge-watch" : "badge-danger");
        badge.textContent =
          res.marginSignal === "HEALTHY"
            ? "HEALTHY MARGIN"
            : res.marginSignal === "WATCH"
              ? "WATCH SCOPE & DISCOUNT"
              : "MARGIN TOO THIN — REPRICE";
      }

      var tbody = doc.getElementById("ml-scenario-body");
      if (tbody) {
        var allRows = [res.custom].concat(res.scenarios);
        tbody.innerHTML = allRows
          .map(function (row, idx) {
            return (
              "<tr" +
              (idx === 0 ? ' style="background:rgba(16,185,129,0.08);font-weight:700;"' : "") +
              ">" +
              "<td>" + row.label + "</td>" +
              '<td class="num">' + formatMoney(row.collectedRevenue, c, 0) + "</td>" +
              '<td class="num">' + row.actualHours.toFixed(1) + "h</td>" +
              '<td class="num">' + formatMoney(row.effectiveRate, c, 0) + "/hr</td>" +
              '<td class="num">' + formatPercent(row.grossMarginPct, 1) + "</td>" +
              '<td class="num">' + formatMoney(row.grossProfit, c, 0) + "</td>" +
              "</tr>"
            );
          })
          .join("");
      }
      return res;
    }

    Object.keys(ids).forEach(function (k) {
      var el = doc.getElementById(ids[k]);
      if (el) {
        el.addEventListener("input", compute);
        el.addEventListener("change", compute);
      }
    });
    var resetBtn = doc.getElementById("ml-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        Object.keys(ids).forEach(function (k) {
          var el = doc.getElementById(ids[k]);
          if (el) el.value = defaults[k];
        });
        compute();
      });
    }
    attachCopyBtn(doc, "ml-copy", function () {
      var r = compute();
      return (
        "MarginProof Scope-Creep & Discount Impact:\n" +
        "- Baseline Quoted Rate: " + formatMoney(r.baselineEffectiveRate, r.currency, 0) + "/hr\n" +
        "- Realized Effective Rate: " + formatMoney(r.custom.effectiveRate, r.currency, 0) + "/hr (" + formatPercent(r.custom.rateDropPct, 1) + ")\n" +
        "- Profit Lost to Discount + Creep: " + formatMoney(Math.max(0, r.custom.profitErosion), r.currency, 0)
      );
    });
    compute();
  }

  function initRetainerCalc(doc) {
    var ids = {
      currency: "rt-currency",
      retainerFee: "rt-fee",
      contractedHours: "rt-contracted",
      inScopeHours: "rt-inscope",
      creepHours: "rt-creep",
      costPerHour: "rt-cost",
      targetHourly: "rt-target",
    };
    readQueryOverrides(doc, ids);
    var defaults = {};
    Object.keys(ids).forEach(function (k) {
      var el = doc.getElementById(ids[k]);
      if (el) defaults[k] = el.value;
    });

    function compute() {
      var payload = {};
      Object.keys(ids).forEach(function (k) {
        var el = doc.getElementById(ids[k]);
        payload[k] = el ? el.value : defaults[k];
      });
      var res = calculateRetainerProfitability(payload);
      var c = res.currency;

      setText(doc, "out-rt-util", formatPercent(res.utilizationPct, 1));
      setText(doc, "out-rt-realized", formatMoney(res.realizedRate, c, 0) + "/hr");
      setText(doc, "out-rt-contracted-rate", formatMoney(res.contractedRate, c, 0) + "/hr");
      setText(doc, "out-rt-profit", formatMoney(res.grossProfit, c, 0));
      setText(doc, "out-rt-margin", formatPercent(res.grossMarginPct, 1));
      setText(doc, "out-rt-hours", res.totalLoggedHours.toFixed(1) + " / " + res.contractedHours + " hrs");
      setText(doc, "out-rt-leak", formatMoney(res.unbilledLeakValue, c, 0) + "/mo");
      setText(doc, "out-rt-reset", formatMoney(res.recommendedResetFee, c, 0) + "/mo");

      var badge = doc.getElementById("out-rt-status");
      if (badge) {
        badge.className = "badge " + (res.status === "HEALTHY" ? "badge-healthy" : res.status === "WATCH" ? "badge-watch" : "badge-danger");
        badge.textContent = res.status;
      }

      var meter = doc.getElementById("rt-util-meter");
      if (meter) {
        meter.style.width = clamp((res.utilizationPct / 1.4) * 100, 4, 100).toFixed(1) + "%";
        meter.style.background = res.status === "HEALTHY" ? "var(--emerald)" : res.status === "WATCH" ? "var(--gold)" : "var(--red)";
      }
      return res;
    }

    Object.keys(ids).forEach(function (k) {
      var el = doc.getElementById(ids[k]);
      if (el) {
        el.addEventListener("input", compute);
        el.addEventListener("change", compute);
      }
    });
    var resetBtn = doc.getElementById("rt-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        Object.keys(ids).forEach(function (k) {
          var el = doc.getElementById(ids[k]);
          if (el) el.value = defaults[k];
        });
        compute();
      });
    }
    attachCopyBtn(doc, "rt-copy", function () {
      var r = compute();
      return (
        "MarginProof Retainer Health Check:\n" +
        "- Status: " + r.status + " (" + formatPercent(r.utilizationPct, 1) + " utilization)\n" +
        "- Realized Hourly Rate: " + formatMoney(r.realizedRate, r.currency, 0) + "/hr (vs. " + formatMoney(r.contractedRate, r.currency, 0) + "/hr contracted)\n" +
        "- Gross Margin: " + formatPercent(r.grossMarginPct, 1) + " (" + formatMoney(r.grossProfit, r.currency, 0) + "/mo)\n" +
        "- Recommended Renewal Reset: " + formatMoney(r.recommendedResetFee, r.currency, 0) + "/mo"
      );
    });
    compute();
  }

  function initTaxRunwayCalc(doc) {
    var ids = {
      baseCurrency: "tx-base-cur",
      fxCurrency: "tx-fx-cur",
      fxRate: "tx-fx-rate",
      bankBalance: "tx-bank",
      baseMonthlyRevenue: "tx-rev-base",
      fxMonthlyRevenue: "tx-rev-fx",
      monthlyExpenses: "tx-exp",
      vatSharePct: "tx-vat-share",
      vatRatePct: "tx-vat-rate",
      incomeTaxPct: "tx-tax-rate",
      monthsAccumulated: "tx-months",
      openReceivables: "tx-ar-open",
      overdueReceivables: "tx-ar-overdue",
    };
    readQueryOverrides(doc, ids);
    var defaults = {};
    Object.keys(ids).forEach(function (k) {
      var el = doc.getElementById(ids[k]);
      if (el) defaults[k] = el.value;
    });

    var baseCurEl = doc.getElementById("tx-base-cur");
    var fxCurEl = doc.getElementById("tx-fx-cur");
    var fxRateEl = doc.getElementById("tx-fx-rate");
    var eurValueMap = { EUR: 1.0, USD: 0.92, GBP: 1.17, CHF: 1.06, CAD: 0.67 };
    function updateCrossFxPreset() {
      if (!fxCurEl || !fxRateEl) return;
      var baseCode = baseCurEl ? baseCurEl.value : "EUR";
      var fxCode = fxCurEl.value;
      var fxToEur = eurValueMap[fxCode];
      var baseToEur = eurValueMap[baseCode];
      if (fxToEur && baseToEur) {
        fxRateEl.value = (fxToEur / baseToEur).toFixed(3);
      }
      compute();
    }
    if (fxCurEl && fxRateEl) {
      fxCurEl.addEventListener("change", updateCrossFxPreset);
    }
    if (baseCurEl && fxRateEl) {
      baseCurEl.addEventListener("change", updateCrossFxPreset);
    }

    function compute() {
      var payload = {};
      Object.keys(ids).forEach(function (k) {
        var el = doc.getElementById(ids[k]);
        payload[k] = el ? el.value : defaults[k];
      });
      var res = calculateTaxAndRunway(payload);
      var c = res.baseCurrency;

      setText(doc, "out-tx-rev-total", formatMoney(res.totalMonthlyNetRevenue, c, 0));
      setText(doc, "out-tx-spendable", formatMoney(res.trueSpendableCash, c, 0));
      setText(doc, "out-tx-reserves", formatMoney(res.totalStatutoryReserves, c, 0));
      setText(doc, "out-tx-tax-mo", formatMoney(res.monthlyTaxReserve, c, 0) + "/mo");
      setText(doc, "out-tx-vat-mo", formatMoney(res.monthlyVatLiability, c, 0) + "/mo");
      setText(doc, "out-tx-owner-net", formatMoney(res.monthlySpendableOwnerNet, c, 0) + "/mo");
      setText(doc, "out-tx-runway", res.runwayMonths >= 999 ? "Zero Burn" : res.runwayMonths.toFixed(1) + " months");
      setText(doc, "out-tx-ar-risk", formatMoney(res.overdueReceivables, c, 0) + " overdue / " + formatMoney(res.openReceivables, c, 0) + " open");

      var badge = doc.getElementById("out-tx-status");
      if (badge) {
        badge.className = "badge " + (res.runwayStatus === "SAFE" ? "badge-healthy" : res.runwayStatus === "WATCH" ? "badge-watch" : "badge-danger");
        badge.textContent = res.runwayStatus === "SAFE" ? "SAFE (>= 6 MO RUNWAY)" : res.runwayStatus === "WATCH" ? "WATCH (3–6 MO RUNWAY)" : "CRITICAL (< 3 MO SPENDABLE)";
      }

      var meter = doc.getElementById("tx-runway-meter");
      if (meter) {
        var barPct = res.runwayMonths >= 999 ? 100 : clamp((res.runwayMonths / 12) * 100, 4, 100);
        meter.style.width = barPct.toFixed(1) + "%";
        meter.style.background = res.runwayStatus === "SAFE" ? "var(--emerald)" : res.runwayStatus === "WATCH" ? "var(--gold)" : "var(--red)";
      }
      return res;
    }

    Object.keys(ids).forEach(function (k) {
      var el = doc.getElementById(ids[k]);
      if (el) {
        el.addEventListener("input", compute);
        el.addEventListener("change", compute);
      }
    });
    var resetBtn = doc.getElementById("tx-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        Object.keys(ids).forEach(function (k) {
          var el = doc.getElementById(ids[k]);
          if (el) el.value = defaults[k];
        });
        compute();
      });
    }
    attachCopyBtn(doc, "tx-copy", function () {
      var r = compute();
      var runwayStr = r.runwayMonths >= 999 ? "Zero Burn" : r.runwayMonths.toFixed(1) + " months runway";
      return (
        "MarginProof Tax Reserve & Runway Snapshot:\n" +
        "- Monthly Revenue (" + r.baseCurrency + "): " + formatMoney(r.totalMonthlyNetRevenue, r.baseCurrency, 0) + "\n" +
        "- Bank Balance: " + formatMoney(r.bankBalance, r.baseCurrency, 0) + "\n" +
        "- Statutory Tax & VAT Reserve: " + formatMoney(r.totalStatutoryReserves, r.baseCurrency, 0) + "\n" +
        "- True Owner Spendable Cash: " + formatMoney(r.trueSpendableCash, r.baseCurrency, 0) + " (" + runwayStr + ")"
      );
    });
    compute();
  }

  function initNicheMiniCalc(doc) {
    var ids = {
      targetNet: "nm-target-net",
      overhead: "nm-overhead",
      taxRate: "nm-tax",
      utilization: "nm-util",
      profitBuffer: "nm-buffer",
      subCost: "nm-sub",
      hoursPerWeek: "nm-hpw",
      weeks: "nm-weeks",
      hoursPerDay: "nm-hpd",
      paymentFee: "nm-fee",
      currency: "nm-currency",
    };

    function compute() {
      var payload = {};
      Object.keys(ids).forEach(function (k) {
        var el = doc.getElementById(ids[k]);
        if (el) payload[k] = el.value;
      });
      var res = calculateHourlyAndDayRate(payload);
      var c = res.currency;
      setText(doc, "nm-out-hr", formatMoney(res.targetHourlyRate, c, 0) + "/hr");
      setText(doc, "nm-out-day", formatMoney(res.recommendedDayRate, c, 0) + "/day");
      setText(doc, "nm-out-floor", formatMoney(res.breakEvenHourly, c, 0) + "/hr");
      setText(doc, "nm-out-gross", formatMoney(res.requiredGrossRevenue, c, 0));

      var fullLink = doc.getElementById("nm-full-calc-link");
      if (fullLink && payload.targetNet !== undefined) {
        var base = fullLink.getAttribute("data-base-href") || "../../calculators/hourly-rate/";
        var qs = Object.keys(ids)
          .filter(function (k) {
            return payload[k] !== undefined && payload[k] !== "";
          })
          .map(function (k) {
            return encodeURIComponent(k) + "=" + encodeURIComponent(payload[k]);
          })
          .join("&");
        fullLink.setAttribute("href", base + (qs ? "?" + qs : ""));
      }
    }

    Object.keys(ids).forEach(function (k) {
      var el = doc.getElementById(ids[k]);
      if (el) {
        el.addEventListener("input", compute);
        el.addEventListener("change", compute);
      }
    });
    compute();
  }

  function initSystemsRoi(doc) {
    var revEl = doc.getElementById("sys-rev");
    var leakEl = doc.getElementById("sys-leak");
    var tierEl = doc.getElementById("sys-tier");
    if (!revEl || !leakEl || !tierEl) return;

    function compute() {
      var res = calculateSystemsRoi({
        monthlyRevenue: revEl.value,
        leakedMarginPct: leakEl.value,
        recoverySharePct: 75,
        tierPrice: tierEl.value,
      });
      setText(doc, "out-sys-leak-mo", formatMoney(res.monthlyLeak, "EUR", 0) + "/mo");
      setText(doc, "out-sys-rec-mo", formatMoney(res.monthlyRecovered, "EUR", 0) + "/mo");
      setText(doc, "out-sys-rec-yr", formatMoney(res.annualRecovered, "EUR", 0) + "/yr");
      setText(doc, "out-sys-payback", res.paybackDays + " days");
      setText(doc, "out-sys-roi", res.firstYearRoiMultiple.toFixed(1) + "x Year-1 ROI");
    }

    [revEl, leakEl, tierEl].forEach(function (el) {
      el.addEventListener("input", compute);
      el.addEventListener("change", compute);
    });
    compute();
  }

  function initPortal() {
    if (typeof document === "undefined") return;
    var doc = document;
    var config = getSiteConfig();
    bindProductButtons(doc, config);

    var calcRoot = doc.querySelector("[data-calc]");
    if (calcRoot) {
      var kind = calcRoot.getAttribute("data-calc");
      if (kind === "hourly-rate") initHourlyRateCalc(doc);
      else if (kind === "margin-leak") initMarginLeakCalc(doc);
      else if (kind === "retainer-profitability") initRetainerCalc(doc);
      else if (kind === "tax-runway") initTaxRunwayCalc(doc);
      else if (kind === "niche-mini") initNicheMiniCalc(doc);
      else if (kind === "systems-roi") initSystemsRoi(doc);
    }

    // Optional live refresh from site_config.json over HTTP/HTTPS (never throws on file://)
    var rootRel = doc.body.getAttribute("data-root-rel") || "";
    if (typeof window !== "undefined" && window.location && /^https?:$/i.test(window.location.protocol) && typeof fetch === "function") {
      fetch(rootRel + "assets/site_config.json", { cache: "no-store" })
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .then(function (liveCfg) {
          if (liveCfg && liveCfg.products) {
            window.MARGINPROOF_CONFIG = liveCfg;
            bindProductButtons(doc, liveCfg);
          }
        })
        .catch(function () {
          /* fallback cleanly to baked MARGINPROOF_CONFIG */
        });
    }
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initPortal);
    } else {
      initPortal();
    }
  }

  return {
    calculateHourlyAndDayRate: calculateHourlyAndDayRate,
    calculateMarginLeak: calculateMarginLeak,
    calculateRetainerProfitability: calculateRetainerProfitability,
    calculateTaxAndRunway: calculateTaxAndRunway,
    calculateSystemsRoi: calculateSystemsRoi,
    formatMoney: formatMoney,
    formatPercent: formatPercent,
    initPortal: initPortal,
  };
});
