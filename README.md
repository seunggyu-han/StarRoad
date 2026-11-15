# StarRoad

주행 경로를 자동으로 기록해 나만의 별자리로 모으는 차량용 앱입니다.

**설치 파일 (2.7.1)** [apk/한승규_StarRoad_release.apk](apk/한승규_StarRoad_release.apk)

## 테스트 환경

- Pleos Connect 에뮬레이터 2.1.0 · Android Automotive OS 14 (API 34) · Windows
- 차량 화면 2560 × 1440 px (가로, 160 dpi) · 앱 표시 영역 1682 × 1210 px

## 실행 방법

1. Android Studio의 Device Manager에서 Pleos 가상 차량을 **Cold boot**로 시작한 뒤, APK를 에뮬레이터 창에 끌어 놓아 설치합니다. [에뮬레이터 설치 안내](https://document.pleos.ai/docs/connect/guide/getting-started/application-development/setup-connect-sdk-emulator)
2. P단에서 StarRoad를 열고 **주행 기록 → 기록 권한 허용**을 눌러 위치·차속·기어 접근을 허용합니다.
3. Pleos Virtual Console에서 D단을 선택해 차속을 3 km/h 이상으로 올리고, 에뮬레이터의 **Extended controls → Location → Routes**에서 경로를 재생합니다.
4. 정차 후 P단을 10초간 유지하면 기록이 저장됩니다. **내 별자리**에서 방금 달린 경로를 확인합니다.
