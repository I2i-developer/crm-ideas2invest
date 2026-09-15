import Image from "next/image";
import styles from "./BrandLoader.module.css";

export default function BrandLoader({ compact = false, label = "Loading" }) {
  return (
    <div className={`${styles.wrap} ${compact ? styles.compact : ""}`} role="status" aria-label={label}>
      <span className={styles.mark}>
        <Image
          src="/images/logo/logo.png"
          alt=""
          fill
          sizes="260px"
          priority
          className="object-contain"
        />
      </span>
    </div>
  );
}
