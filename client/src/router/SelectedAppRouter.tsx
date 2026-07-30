import ConsumerAppRouter from "./ConsumerAppRouter";
import LegacyAppRouter from "./LegacyAppRouter";
import { APP_PRODUCT_MODE } from "@/lib/constants";

export default function SelectedAppRouter() {
  return APP_PRODUCT_MODE === "consumer"
    ? <ConsumerAppRouter />
    : <LegacyAppRouter />;
}
