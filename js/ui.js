// 화면에 숫자 금액을 한국 원화 표기(예: 13,500원)로 출력할 때 사용합니다.
const subscriptionUI = (() => {
  const currency = new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0
  });

  // 사용자 입력값을 HTML에 넣기 전에 특수문자를 바꿔 HTML 코드로 해석되지 않게 합니다.
  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  // YYYY-MM-DD 날짜 문자열을 화면에 읽기 쉬운 YYYY.MM.DD 형식으로 바꿉니다.
  function formatDate(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    return `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
  }

  // 날짜 입력칸과 계산 함수가 쓰는 로컬 기준 날짜를 YYYY-MM-DD로 만듭니다.
  // toISOString()은 UTC 기준이므로 시간대에 따라 날짜가 하루 달라질 수 있어 직접 조합합니다.
  function localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // logic.js의 합계/예정 함수로 요약 숫자를 계산하고 각 HTML 위치에 넣습니다.
  function renderSummary(subscriptions) {
    const monthly = getTotalMonthlyAmount(subscriptions);
    const yearly = getTotalYearlyAmount(subscriptions);
    const upcoming = getUpcomingPayments(subscriptions, 7);
    const upcomingAmount = upcoming.reduce((sum, subscription) => sum + subscription.amount, 0);

    document.querySelector('#monthly-total').textContent = currency.format(monthly);
    document.querySelector('#yearly-total').textContent = currency.format(yearly);
    document.querySelector('#upcoming-total').textContent = `${upcoming.length}건`;
    document.querySelector('#upcoming-detail').textContent = upcoming.length
      ? `예정 금액 ${currency.format(upcomingAmount)}`
      : '예정된 결제가 없습니다';
    document.querySelector('#subscription-count').textContent = subscriptions.length;
    document.querySelector('#today-label').textContent = new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    }).format(new Date());
  }

  // 구독 목록을 다음 결제일 순으로 정렬해 카드로 표시합니다.
  // 카드 버튼에는 data-action을 붙여 main.js가 수정/삭제 동작을 구분하도록 합니다.
  function renderSubscriptions(subscriptions) {
    const list = document.querySelector('#subscription-list');
    const sorted = [...subscriptions].sort((first, second) => first.nextPaymentDate.localeCompare(second.nextPaymentDate));

    if (!sorted.length) {
      list.innerHTML = '<div class="empty-state"><strong>아직 등록된 구독이 없어요</strong>오른쪽 폼에서 첫 구독을 추가해 보세요.</div>';
      return;
    }

    const today = localDateString();
    list.innerHTML = sorted.map(subscription => {
      // 결제일까지 남은 날 수로 D-day 문구와 임박 강조 여부를 정합니다.
      const days = getDaysUntilNextPayment(today, subscription.nextPaymentDate);
      const dayLabel = days < 0 ? `D+${Math.abs(days)}` : days === 0 ? 'D-day' : `D-${days}`;
      const monthlyAmount = getMonthlyAmount(subscription);
      const cycleLabel = subscription.cycle === 'yearly' ? '연간' : '월간';
      const upcomingClass = days >= 0 && days <= 7 ? ' is-soon' : '';

      return `<article class="subscription-card" data-id="${escapeHTML(subscription.id)}">
        <div class="subscription-main">
          <div class="subscription-title-row">
            <h3 class="subscription-name">${escapeHTML(subscription.name)}</h3>
            <span class="cycle-tag">${cycleLabel}</span>
          </div>
          <div class="subscription-meta">
            <span class="category-tag">${escapeHTML(subscription.category)}</span>
            <span>다음 결제 ${formatDate(subscription.nextPaymentDate)}</span>
          </div>
        </div>
        <div>
          <p class="subscription-price">${currency.format(monthlyAmount)}<span class="summary-detail"> / 월</span></p>
          <span class="payment-day${upcomingClass}">${dayLabel}</span>
        </div>
        <div class="card-actions">
          <button class="icon-button" type="button" data-action="edit" aria-label="${escapeHTML(subscription.name)} 수정">수정</button>
          <button class="icon-button delete-button" type="button" data-action="delete" aria-label="${escapeHTML(subscription.name)} 삭제">삭제</button>
        </div>
      </article>`;
    }).join('');
  }

  // 카테고리마다 월 금액을 합산하고 전체 월 지출에서 차지하는 비율을 막대로 표시합니다.
  function renderCategories(subscriptions) {
    const container = document.querySelector('#category-breakdown');
    const totals = getMonthlyAmountByCategory(subscriptions);
    const entries = Object.entries(totals).sort((first, second) => second[1] - first[1]);
    const overall = entries.reduce((sum, entry) => sum + entry[1], 0);

    if (!entries.length || overall === 0) {
      container.innerHTML = '<p class="category-empty">구독을 추가하면 비중을 볼 수 있어요.</p>';
      return;
    }

    container.innerHTML = entries.map(([category, amount], index) => {
      // 비율은 정수 퍼센트로 반올림하며, 색상은 카테고리마다 순환해서 사용합니다.
      const percentage = Math.round(amount / overall * 100);
      return `<div class="category-row">
        <div class="category-label-row"><strong>${escapeHTML(category)}</strong><span>${currency.format(amount)} · ${percentage}%</span></div>
        <div class="category-track" role="img" aria-label="${escapeHTML(category)} ${percentage}%">
          <div class="category-fill color-${index % 6}" style="width: ${percentage}%"></div>
        </div>
      </div>`;
    }).join('');
  }

  // 데이터가 바뀌면 요약, 카드 목록, 카테고리 표시를 한 번에 다시 그립니다.
  function renderAll(subscriptions) {
    renderSummary(subscriptions);
    renderSubscriptions(subscriptions);
    renderCategories(subscriptions);
  }

  // 다른 파일에서는 아래 공개한 함수만 subscriptionUI 이름으로 사용할 수 있습니다.
  return { currency, localDateString, renderAll };
})();