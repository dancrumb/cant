# Hello World

This is a simple example of Cant, showing everybody's favourite: Hello World

The first thing we need to do it bring in the IO module, so that we can write to stdout

```cant
import IO
```

Next, we need to define an `Action` that writes our message

```cant
action SayHello():VOID
    body
        IO::stdout.write("Hello World!")
```

Finally, we need to invoke that `Action` based on a `Trigger`

```cant
trigger SayHello on Start
```