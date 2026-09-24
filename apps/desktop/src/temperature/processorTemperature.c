#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/hid/IOHIDDeviceKeys.h>
#include <IOKit/hidsystem/IOHIDEventSystemClient.h>
#include <IOKit/hidsystem/IOHIDServiceClient.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

typedef struct __IOHIDEvent *IOHIDEventRef;

// The macOS SDK declares the client types and matching keys, but not these
// private functions. These signatures follow Netdata and Stats and remain an
// unsupported macOS ABI.
extern IOHIDEventSystemClientRef IOHIDEventSystemClientCreate(CFAllocatorRef allocator);
extern void IOHIDEventSystemClientSetMatching(
	IOHIDEventSystemClientRef client, CFDictionaryRef matching);
extern IOHIDEventRef IOHIDServiceClientCopyEvent(IOHIDServiceClientRef service, int64_t type,
	int32_t options, int64_t timestamp);
extern double IOHIDEventGetFloatValue(IOHIDEventRef event, uint32_t field);

static const int64_t temperatureEvent = 15;
static const uint32_t temperatureLevel = 15 << 16;
static const char processorSensorPrefix[] = "PMU tdie";

static CFDictionaryRef temperatureMatching(void) {
	int32_t usagePage = 0xff00;
	int32_t usage = 0x5;
	CFNumberRef usagePageValue =
		CFNumberCreate(kCFAllocatorDefault, kCFNumberSInt32Type, &usagePage);
	CFNumberRef usageValue = CFNumberCreate(kCFAllocatorDefault, kCFNumberSInt32Type, &usage);
	const void *keys[] = {
		CFSTR(kIOHIDPrimaryUsagePageKey),
		CFSTR(kIOHIDPrimaryUsageKey),
	};
	const void *values[] = {usagePageValue, usageValue};
	CFDictionaryRef matching = CFDictionaryCreate(kCFAllocatorDefault, keys, values, 2,
		&kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
	CFRelease(usagePageValue);
	CFRelease(usageValue);
	return matching;
}

static int sensorName(CFTypeRef value, char *target, CFIndex size) {
	return value != NULL && CFGetTypeID(value) == CFStringGetTypeID() &&
		CFStringGetCString((CFStringRef)value, target, size, kCFStringEncodingUTF8);
}

static void printJsonString(const char *value) {
	putchar('"');
	for (const unsigned char *cursor = (const unsigned char *)value; *cursor != '\0'; cursor += 1) {
		if (*cursor == '"' || *cursor == '\\') putchar('\\');
		putchar(*cursor);
	}
	putchar('"');
}

static int unavailable(const char *reason) {
	printf("{\"state\":\"unavailable\",\"reason\":\"%s\"}\n", reason);
	return 0;
}

int main(void) {
	CFDictionaryRef matching = temperatureMatching();
	IOHIDEventSystemClientRef client = IOHIDEventSystemClientCreate(kCFAllocatorDefault);
	if (client == NULL) {
		CFRelease(matching);
		return unavailable("client-unavailable");
	}
	IOHIDEventSystemClientSetMatching(client, matching);
	CFArrayRef services = IOHIDEventSystemClientCopyServices(client);
	if (services == NULL) {
		CFRelease(client);
		CFRelease(matching);
		return unavailable("services-unavailable");
	}

	double highestCelsius = -INFINITY;
	char highestSensor[128] = {0};
	for (CFIndex index = 0; index < CFArrayGetCount(services); index += 1) {
		IOHIDServiceClientRef service = (IOHIDServiceClientRef)CFArrayGetValueAtIndex(services, index);
		CFTypeRef product = IOHIDServiceClientCopyProperty(service, CFSTR("Product"));
		char sensor[128] = {0};
		if (!sensorName(product, sensor, sizeof(sensor)) ||
			strncmp(sensor, processorSensorPrefix, strlen(processorSensorPrefix)) != 0) {
			if (product != NULL) CFRelease(product);
			continue;
		}
		IOHIDEventRef event = IOHIDServiceClientCopyEvent(service, temperatureEvent, 0, 0);
		if (event != NULL) {
			double celsius = IOHIDEventGetFloatValue(event, temperatureLevel);
			if (isfinite(celsius) && celsius > highestCelsius) {
				highestCelsius = celsius;
				strlcpy(highestSensor, sensor, sizeof(highestSensor));
			}
			CFRelease(event);
		}
		CFRelease(product);
	}
	CFRelease(services);
	CFRelease(client);
	CFRelease(matching);

	if (!isfinite(highestCelsius)) return unavailable("no-processor-temperature-sensor");
	fputs("{\"state\":\"available\",\"source\":\"IOHIDEventSystemClient\",\"sensor\":", stdout);
	printJsonString(highestSensor);
	printf(",\"units\":\"degrees Celsius\",\"celsius\":%.3f}\n", highestCelsius);
	return 0;
}
