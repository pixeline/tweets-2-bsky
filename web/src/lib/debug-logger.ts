const DEBUG_PREFIX = '[tweets-2-bsky:web]';

function describeTarget(target: EventTarget | null): string {
  if (!(target instanceof Element)) {
    return 'unknown-target';
  }

  const tagName = target.tagName.toLowerCase();
  const id = target.id ? `#${target.id}` : '';
  const className =
    typeof target.className === 'string' && target.className.trim().length > 0
      ? `.${target.className
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 3)
          .join('.')}`
      : '';

  return `${tagName}${id}${className}`;
}

function eventToPayload(event: Event): Record<string, unknown> {
  const target = event.target;
  const payload: Record<string, unknown> = {
    type: event.type,
    target: describeTarget(target),
    timestamp: new Date().toISOString(),
    path: window.location.pathname,
  };

  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    payload.name = target.name || undefined;
    payload.value = target.value;
  }

  if (event instanceof MouseEvent) {
    payload.button = event.button;
    payload.clientX = event.clientX;
    payload.clientY = event.clientY;
  }

  return payload;
}

export function setupBrowserDebugLogging(): void {
  const events = ['click', 'change', 'input', 'submit'];

  events.forEach((eventName) => {
    document.addEventListener(
      eventName,
      (event) => {
        console.debug(`${DEBUG_PREFIX} ui-event`, eventToPayload(event));
      },
      true,
    );
  });

  window.addEventListener('focus', () => {
    console.debug(`${DEBUG_PREFIX} window-focus`, { timestamp: new Date().toISOString() });
  });

  window.addEventListener('blur', () => {
    console.debug(`${DEBUG_PREFIX} window-blur`, { timestamp: new Date().toISOString() });
  });

  document.addEventListener('visibilitychange', () => {
    console.debug(`${DEBUG_PREFIX} visibility`, {
      state: document.visibilityState,
      timestamp: new Date().toISOString(),
    });
  });

  window.addEventListener('popstate', () => {
    console.debug(`${DEBUG_PREFIX} popstate`, {
      path: window.location.pathname,
      timestamp: new Date().toISOString(),
    });
  });

  console.info(`${DEBUG_PREFIX} verbose browser event logging enabled`);
}
