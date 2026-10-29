import { useEffect } from "react";
import { ensureAthleticFonts } from "./theme";

export default function useAthleticFonts() {
  useEffect(() => {
    ensureAthleticFonts();
  }, []);
}
