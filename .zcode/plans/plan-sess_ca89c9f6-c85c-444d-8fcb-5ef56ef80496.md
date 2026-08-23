Refactoring plan for separating mobile and desktop platforms while preserving history functionality:

1. **Platform Detection Enhancement**: Improve mobile/desktop detection in app.js with explicit platform flag
2. **Resource Separation**: 
   - Separate icon assets into platform-specific folders
   - Create distinct build outputs (dist-mobile/ vs dist-desktop/)
3. **State Management**: 
   - Enhance __store with platform-aware state synchronization
   - Ensure selectedIds and history state are properly isolated
4. **Event Handling Refactoring**:
   - Abstract touch/click events with platform detection
   - Preserve existing iOS touchend fixes while adding desktop-specific handlers
5. **Tauri Configuration**:
   - Split tauri.conf.json into platform-specific configs
   - Consolidate duplicated icon assets using build-time generation
6. **Verification Approach**:
   - Test history selection → input restoration flow
   - Validate multi-select comparison functionality
   - Confirm state isolation between platforms
   - Verify touch events work correctly on iOS/Android
   - Confirm mouse/keyboard events work on desktop

Key focus areas: history-list interactions, checkbox selection, compare button state, and ensuring the 2-circle icon issue doesn't reappear.