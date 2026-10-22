// 이 파일은 사용자 입력과 데이터 저장을 담당합니다. 화면 모양은 ui.js에 맡깁니다.
(() => {
  // 브라우저 저장소에서 구독 데이터를 찾을 때 사용할 이름입니다.
  const STORAGE_KEY = 'sub-tracker-subscriptions';

  // HTML에서 입력 폼과 목록, 상태 메시지를 찾아 이후 이벤트에 연결합니다.
  const form = document.querySelector('#subscription-form');
  const list = document.querySelector('#subscription-list');
  const status = document.querySelector('#form-status');
  const submitButton = document.querySelector('#submit-button');
  const cancelButton = document.querySelector('#cancel-edit');
  let subscriptions = loadSubscriptions();
  // null이면 새 구독 추가, 문자열 ID가 있으면 해당 구독 수정 중입니다.
  let editingId = null;

  // 저장소에서 데이터를 읽고 JSON 문자열을 JavaScript 배열로 되돌립니다.
  // 저장 데이터가 없거나 손상되었거나 형식이 맞지 않으면 빈 배열로 시작합니다.
  function loadSubscriptions() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(saved)) return [];
      return saved.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string'
        && Number.isFinite(Number(item.amount)) && typeof item.nextPaymentDate === 'string')
        .map(item => ({
          ...item,
          amount: Number(item.amount),
          cycle: item.cycle === 'yearly' ? 'yearly' : 'monthly',
          category: typeof item.category === 'string' && item.category ? item.category : '기타'
        }));
    } catch (error) {
      return [];
    }
  }

  // 현재 배열 전체를 localStorage에 저장합니다. 브라우저가 저장을 막으면 화면에 알립니다.
  function saveSubscriptions() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
      return true;
    } catch (error) {
      showStatus('저장 공간에 접근할 수 없어 변경 사항을 저장하지 못했어요.', true);
      return false;
    }
  }

  // 추가/수정 결과 또는 오류 안내를 폼 아래에 표시합니다.
  function showStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }

  // 각 구독을 구별할 ID를 만듭니다. 최신 브라우저에서는 UUID, 아니면 시간과 임의 문자열을 씁니다.
  function createId() {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `sub_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  // 입력칸을 비우고 폼을 '새 구독 추가' 상태로 되돌립니다.
  function resetForm() {
    form.reset();
    document.querySelector('#next-payment-date').value = subscriptionUI.localDateString();
    editingId = null;
    submitButton.innerHTML = '구독 추가 <span aria-hidden="true">+</span>';
    cancelButton.hidden = true;
  }

  // 수정 버튼을 누르면 기존 구독 정보를 폼에 채우고 저장 버튼을 수정 모드로 바꿉니다.
  function startEditing(id) {
    const subscription = subscriptions.find(item => item.id === id);
    if (!subscription) return;
    editingId = id;
    form.elements.name.value = subscription.name;
    form.elements.amount.value = subscription.amount;
    form.elements.cycle.value = subscription.cycle;
    form.elements.category.value = subscription.category;
    form.elements.nextPaymentDate.value = subscription.nextPaymentDate;
    submitButton.textContent = '수정 저장';
    cancelButton.hidden = false;
    showStatus('구독 정보를 수정 중입니다.');
    document.querySelector('#form-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
    form.elements.name.focus({ preventScroll: true });
  }

  // 폼 제출: 브라우저 기본 새로고침을 막고 입력을 확인한 뒤 배열과 저장소를 갱신합니다.
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const amount = Number(data.get('amount'));
    // 금액은 원 단위 정수만 받습니다. 빈 값이나 소수, 1원 미만은 저장하지 않습니다.
    if (!Number.isSafeInteger(amount) || amount < 1) {
      showStatus('결제 금액은 1원 이상의 정수로 입력해 주세요.', true);
      return;
    }

    const subscription = {
      id: editingId || createId(),
      name: String(data.get('name')).trim(),
      amount,
      cycle: String(data.get('cycle')),
      category: String(data.get('category')),
      nextPaymentDate: String(data.get('nextPaymentDate'))
    };

    // 수정 중이면 같은 ID의 항목을 교체하고, 새 항목이면 배열 끝에 추가합니다.
    if (editingId) {
      subscriptions = subscriptions.map(item => item.id === editingId ? subscription : item);
    } else {
      subscriptions.push(subscription);
    }

    const wasEditing = Boolean(editingId);
    resetForm();
    // 화면을 먼저 갱신한 다음 localStorage에 기록해 다음 방문에도 유지되게 합니다.
    subscriptionUI.renderAll(subscriptions);
    if (saveSubscriptions()) showStatus(wasEditing ? '구독 정보를 수정했어요.' : '구독을 추가했어요.');
  });

  // 카드마다 버튼을 따로 연결하는 대신 목록 한 곳에서 클릭을 받아 처리합니다.
  // 카드가 새로 그려져도 이벤트 처리를 다시 연결할 필요가 없는 방식입니다.
  list.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const card = button.closest('[data-id]');
    if (!card) return;

    if (button.dataset.action === 'edit') {
      startEditing(card.dataset.id);
      return;
    }

    if (button.dataset.action === 'delete') {
      const subscription = subscriptions.find(item => item.id === card.dataset.id);
      // 실수로 지우지 않도록 확인한 후 배열에서 항목을 제거합니다.
      if (!subscription || !window.confirm(`'${subscription.name}' 구독을 삭제할까요?`)) return;
      subscriptions = subscriptions.filter(item => item.id !== card.dataset.id);
      if (editingId === card.dataset.id) resetForm();
      subscriptionUI.renderAll(subscriptions);
      if (saveSubscriptions()) showStatus('구독을 삭제했어요.');
    }
  });

  // 수정 취소 버튼은 입력을 버리고 새 구독 입력 상태로 되돌립니다.
  cancelButton.addEventListener('click', () => {
    resetForm();
    showStatus('수정을 취소했어요.');
  });

  // 첫 화면을 준비합니다: 다음 결제일 기본값을 오늘로 하고 저장된 구독을 렌더링합니다.
  document.querySelector('#next-payment-date').value = subscriptionUI.localDateString();
  subscriptionUI.renderAll(subscriptions);
})();