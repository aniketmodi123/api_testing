import { RunnerProvider } from "./context/RunnerContext";
import Sidebar from "./components/Sidebar/Sidebar";
import Controls from "./components/Controls/Controls";
import ApiPicker from "./components/ApiPicker/ApiPicker";
import CasePicker from "./components/CasePicker/CasePicker";
import Summary from "./components/Summary/Summary";
import Results from "./components/Results/Results";
import FocusModal from "./components/FocusModal/FocusModal";
import styles from "./App.module.css";

export default function App(){
  return (
    <RunnerProvider>
      <div className={styles.app}>
        <aside className={styles.left}>
          <Sidebar />
        </aside>
        <main className={styles.right}>
          <Controls />
          <div className={styles.two}>
            <ApiPicker />
            <CasePicker />
          </div>
          <Summary />
          <Results />
        </main>
      </div>
      <FocusModal />
    </RunnerProvider>
  );
}
