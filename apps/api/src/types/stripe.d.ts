declare module 'stripe' {
  class Stripe {
    constructor(key: string, options?: any);
    checkout: any;
    webhooks: any;
    customers: any;
    [key: string]: any;
  }
  namespace Stripe {
    type Event = any;
    type RequestOptions = any;
    namespace Checkout {
      type Session = any;
      type SessionCreateParams = any;
    }
  }
  export default Stripe;
}
