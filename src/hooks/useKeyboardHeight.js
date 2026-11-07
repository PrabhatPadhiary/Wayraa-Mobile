import { useEffect, useState } from 'react';
import { Keyboard, LayoutAnimation, Platform } from 'react-native';

/**
 * Current on-screen keyboard height (0 when hidden).
 *
 * Bottom sheets use it to sit on top of the keyboard and cap their own height
 * to the space that's left, instead of being pushed off the top of the screen
 * by KeyboardAvoidingView. On iOS the change is animated in step with the
 * keyboard.
 */
export default function useKeyboardHeight() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const animate = (e) => {
      if (Platform.OS === 'ios') {
        LayoutAnimation.configureNext({
          duration: e?.duration || 250,
          update: { type: LayoutAnimation.Types.keyboard },
        });
      }
    };

    const show = Keyboard.addListener(showEvent, (e) => {
      animate(e);
      setHeight(e.endCoordinates?.height || 0);
    });
    const hide = Keyboard.addListener(hideEvent, (e) => {
      animate(e);
      setHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
