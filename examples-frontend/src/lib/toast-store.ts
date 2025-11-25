type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

type ToastListener = (toasts: Toast[]) => void;

class ToastStore {
  private toasts: Toast[] = [];
  private listeners: ToastListener[] = [];

  subscribe(listener: ToastListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener([...this.toasts]));
  }

  show(message: string, type: ToastType = 'info', duration: number = 5000) {
    const id = Math.random().toString(36).substring(7);
    const toast: Toast = { id, message, type, duration };

    this.toasts.push(toast);
    this.notify();

    if (duration > 0) {
      setTimeout(() => {
        this.remove(id);
      }, duration);
    }
  }

  remove(id: string) {
    this.toasts = this.toasts.filter((toast) => toast.id !== id);
    this.notify();
  }

  getToasts(): Toast[] {
    return [...this.toasts];
  }
}

export const toastStore = new ToastStore();

