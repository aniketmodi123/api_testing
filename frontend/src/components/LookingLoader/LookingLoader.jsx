import lookingGif from '../../assets/looking.gif';

export default function LookingLoader({
  size = 120,
  text = 'Processing...',
  textColor = '#fff',
  textSize = 20,
  overlay = false,
  style = {},
  textStyle = {},
  ...props
}) {
  const loaderContent = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
      {...props}
    >
      <img
        src={lookingGif}
        alt={text}
        style={{ width: size, height: size, objectFit: 'contain' }}
      />
      {text && (
        <div
          style={{
            color: textColor,
            fontSize: textSize,
            marginTop: 16,
            fontWeight: 500,
            ...textStyle,
          }}
        >
          {text}
        </div>
      )}
    </div>
  );

  if (overlay) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.4)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {loaderContent}
      </div>
    );
  }
  return loaderContent;
}
