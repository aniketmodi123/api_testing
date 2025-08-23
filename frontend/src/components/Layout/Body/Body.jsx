const Body = ({ children }) => {
  const styles = {
    main: {
      flex: 1,
      padding: 0,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    },
  };

  return <main style={styles.main}>{children}</main>;
};

export default Body;
