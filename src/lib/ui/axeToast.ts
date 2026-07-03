import { toast } from "sonner";

type AxeToastOpts = {
  description?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
};

/** App-wide toast — matte black shell via global Sonner styles. */
export function axeToast(message: string, opts?: AxeToastOpts) {
  return toast(message, opts);
}

export function axeToastSuccess(message: string, opts?: AxeToastOpts) {
  return toast.success(message, opts);
}

export function axeToastError(message: string, opts?: AxeToastOpts) {
  return toast.error(message, opts);
}

export function axeToastInfo(message: string, opts?: AxeToastOpts) {
  return toast.info(message, opts);
}
