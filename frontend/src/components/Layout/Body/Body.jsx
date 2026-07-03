const Body = ({ children }) => {
  const styles = {
    main: {
      flex: 1,
      overflow: 'hidden',
      display: 'flex',
      minHeight: 0,
    },
  };

  return <main style={styles.main}>{children}</main>;
};

export default Body;
