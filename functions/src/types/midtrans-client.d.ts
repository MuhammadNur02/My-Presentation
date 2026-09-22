/** `midtrans-client` tidak menyertakan tipe bawaan — deklarasi minimal untuk bagian yang dipakai proyek ini. */
declare module 'midtrans-client' {
  export interface SnapOptions {
    isProduction: boolean;
    serverKey: string;
    clientKey: string;
  }

  export interface TransactionDetails {
    order_id: string;
    gross_amount: number;
  }

  export interface ItemDetail {
    id: string;
    price: number;
    quantity: number;
    name: string;
  }

  export interface CustomerDetails {
    email?: string;
    first_name?: string;
  }

  export interface CreateTransactionParams {
    transaction_details: TransactionDetails;
    item_details?: ItemDetail[];
    customer_details?: CustomerDetails;
  }

  export interface CreateTransactionResult {
    token: string;
    redirect_url: string;
  }

  export class Snap {
    constructor(options: SnapOptions);
    createTransaction(params: CreateTransactionParams): Promise<CreateTransactionResult>;
  }
}
