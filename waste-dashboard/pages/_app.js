import "@/styles/globals.css";
import { BinsProvider } from "../context/BinsContext";

export default function App({ Component, pageProps }) {
  return(
    <BinsProvider>
      <Component {...pageProps} />
    </BinsProvider>
  );
}
