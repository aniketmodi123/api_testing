import Body from './Body/Body.jsx';
import Header from './Header/Header.jsx';

const Layout = ({ children }) => {
  const styles = {
    layout: {
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden', // Prevent scrolling on the main container
    },
  };

  return (
    <div style={styles.layout}>
      <Header />
      <Body>{children}</Body>
    </div>
  );
};

export default Layout;
