const Body = ({ children }) => {
  const styles = {
    main: {
      flex: 1,
      padding: '1rem',
      overflow: 'auto',
    },
  };

  return <main style={styles.main}>{children}</main>;
};

export default Body;
